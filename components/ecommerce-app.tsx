"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Controls from "@/components/controls";
import Logs from "@/components/logs";
import ProductResults from "@/components/product-results";
import { INSTRUCTIONS, TOOLS } from "@/lib/config";
import { BASE_URL, MODEL } from "@/lib/constants";

type ToolCallOutput = {
  response: string;
  [key: string]: any;
};

export default function EcommerceApp() {
  const [logs, setLogs] = useState<any[]>([]);
  const [toolCall, setToolCall] = useState<any>(null);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<string>("");

  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const audioTransceiver = useRef<RTCRtpTransceiver | null>(null);
  const tracks = useRef<RTCRtpSender[] | null>(null);

  // Start a new realtime session
  async function startSession() {
    try {
      if (!isSessionStarted) {
        setIsSessionStarted(true);
        // Get an ephemeral session token
        const session = await fetch("/api/session").then((response) =>
          response.json()
        );
        const sessionToken = session.client_secret.value;
        const sessionId = session.id;

        console.log("Session id:", sessionId);

        // Create a peer connection
        const pc = new RTCPeerConnection();

        // Set up to play remote audio from the model
        if (!audioElement.current) {
          audioElement.current = document.createElement("audio");
        }
        audioElement.current.autoplay = true;
        pc.ontrack = (e) => {
          if (audioElement.current) {
            audioElement.current.srcObject = e.streams[0];
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        stream.getTracks().forEach((track) => {
          const sender = pc.addTrack(track, stream);
          if (sender) {
            tracks.current = [...(tracks.current || []), sender];
          }
        });

        // Set up data channel for sending and receiving events
        const dc = pc.createDataChannel("oai-events");
        setDataChannel(dc);

        // Start the session using the Session Description Protocol (SDP)
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpResponse = await fetch(`${BASE_URL}?model=${MODEL}`, {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            "Content-Type": "application/sdp",
          },
        });

        const answer: RTCSessionDescriptionInit = {
          type: "answer",
          sdp: await sdpResponse.text(),
        };
        await pc.setRemoteDescription(answer);

        peerConnection.current = pc;
      }
    } catch (error) {
      console.error("Error starting session:", error);
    }
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionStarted(false);
    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
    }
    setAudioStream(null);
    setIsListening(false);
    audioTransceiver.current = null;
    setTranscript("");
    setToolCall(null);
  }

  // Grabs a new mic track and replaces the placeholder track in the transceiver
  async function startRecording() {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setAudioStream(newStream);

      // If we already have an audioSender, just replace its track:
      if (tracks.current) {
        const micTrack = newStream.getAudioTracks()[0];
        tracks.current.forEach((sender) => {
          sender.replaceTrack(micTrack);
        });
      } else if (peerConnection.current) {
        // Fallback if audioSender somehow didn't get set
        newStream.getTracks().forEach((track) => {
          const sender = peerConnection.current?.addTrack(track, newStream);
          if (sender) {
            tracks.current = [...(tracks.current || []), sender];
          }
        });
      }

      setIsListening(true);
      console.log("Microphone started.");
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }

  // Replaces the mic track with a placeholder track
  function stopRecording() {
    setIsListening(false);

    // Stop existing mic tracks so the user's mic is off
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
    }
    setAudioStream(null);

    // Replace with a placeholder (silent) track
    if (tracks.current) {
      const placeholderTrack = createEmptyAudioTrack();
      tracks.current.forEach((sender) => {
        sender.replaceTrack(placeholderTrack);
      });
    }
  }

  // Creates a placeholder track that is silent
  function createEmptyAudioTrack(): MediaStreamTrack {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    return destination.stream.getAudioTracks()[0];
  }

  // Send a message to the model
  const sendClientEvent = useCallback(
    (message: any) => {
      if (dataChannel) {
        message.event_id = message.event_id || crypto.randomUUID();
        dataChannel.send(JSON.stringify(message));
      } else {
        console.error(
          "Failed to send message - no data channel available",
          message
        );
      }
    },
    [dataChannel]
  );

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    async function handleToolCall(output: any) {
      try {
        const toolCall = {
          name: output.name,
          arguments: output.arguments,
        };
        console.log("Tool call received:", toolCall);
        
        // Asegurar que los argumentos son un string JSON válido
        let args;
        try {
          args = typeof toolCall.arguments === 'string' 
            ? JSON.parse(toolCall.arguments) 
            : toolCall.arguments;
          console.log("Parsed arguments:", args);
        } catch (e) {
          console.error("Failed to parse tool call arguments:", e);
          args = {};
        }
        
        // Actualizar el toolCall con los argumentos parseados
        const validatedToolCall = {
          name: toolCall.name,
          arguments: typeof toolCall.arguments === 'string' ? toolCall.arguments : JSON.stringify(toolCall.arguments)
        };
        
        setToolCall(validatedToolCall);
        console.log("Setting toolCall to:", validatedToolCall);

        // For filter_products function
        const toolCallOutput: ToolCallOutput = {
          response: `Tool call ${toolCall.name} executed successfully.`,
        };

        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: output.call_id,
            output: JSON.stringify(toolCallOutput),
          },
        });

        // Force a model response
        sendClientEvent({
          type: "response.create",
        });
      } catch (error) {
        console.error("Error handling tool call:", error);
      }
    }

    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "response.done") {
          const output = event.response.output[0];
          
          // Verificar que output existe antes de añadirlo a los logs
          if (output && typeof output === 'object') {
            setLogs((prev) => [output, ...prev]);
            
            // Handle transcription
            if (output?.type === "text") {
              setTranscript((prev) => prev + output.text);
            }
            
            // Handle function calls
            if (output?.type === "function_call") {
              handleToolCall(output);
            }
          } else {
            console.warn("Received empty or invalid output:", output);
          }
        }
      });

      // Set session active when the data channel is opened
      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setIsListening(true);
        setLogs([]);
        setTranscript("");
        setToolCall(null);
        
        // Send session config
        const sessionUpdate = {
          type: "session.update",
          session: {
            tools: TOOLS,
            instructions: INSTRUCTIONS,
          },
        };
        sendClientEvent(sessionUpdate);
        console.log("Session update sent:", sessionUpdate);
      });
    }
  }, [dataChannel, sendClientEvent]);

  const handleConnectClick = async () => {
    if (isSessionActive) {
      console.log("Stopping session.");
      stopSession();
    } else {
      console.log("Starting session.");
      startSession();
    }
  };

  const handleMicToggleClick = async () => {
    if (isListening) {
      console.log("Stopping microphone.");
      stopRecording();
    } else {
      console.log("Starting microphone.");
      startRecording();
    }
  };
  
  const handleResetClick = () => {
    setTranscript("");
    setToolCall(null);
  };

  return (
    <div className="relative min-h-screen bg-gray-100">
      <div className="p-4 max-w-6xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2">Voice Shopping Assistant</h1>
          <p className="text-gray-600">Ask for products using your voice</p>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <div className="bg-white p-6 rounded-lg shadow-md min-h-64">
              <h2 className="text-xl font-semibold mb-4">Your Voice Request</h2>
              <div className="p-4 bg-gray-50 rounded-md min-h-36 mb-4">
                {transcript ? (
                  <p>{transcript}</p>
                ) : (
                  <p className="text-gray-400 italic">
                    Press the microphone button and start speaking...
                  </p>
                )}
              </div>
              
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleConnectClick}
                  className={`px-4 py-2 rounded-full font-medium ${
                    isSessionActive
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-blue-500 hover:bg-blue-600 text-white"
                  }`}
                >
                  {isSessionActive ? "Disconnect" : "Connect"}
                </button>
                
                <button
                  onClick={handleMicToggleClick}
                  disabled={!isSessionActive}
                  className={`px-4 py-2 rounded-full font-medium ${
                    isListening
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-green-500 hover:bg-green-600 text-white"
                  } ${!isSessionActive ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {isListening ? "Mute" : "Speak"}
                </button>
                
                <button
                  onClick={handleResetClick}
                  className="px-4 py-2 rounded-full font-medium bg-gray-200 hover:bg-gray-300"
                >
                  Reset
                </button>
              </div>
            </div>
            
            {/* Product Results */}
            <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Product Results</h2>
              <div className="min-h-64">
                {toolCall?.name === "filter_products" ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-md">
                      <h3 className="font-medium mb-2">Search Parameters:</h3>
                      <pre className="text-sm overflow-auto p-2 bg-white rounded">
                        {(() => {
                          try {
                            // Intentar parsear el JSON de forma segura
                            const args = typeof toolCall.arguments === 'string' 
                              ? JSON.parse(toolCall.arguments) 
                              : toolCall.arguments;
                            return JSON.stringify(args, null, 2);
                          } catch (e) {
                            console.error("Error displaying search parameters:", e);
                            return toolCall.arguments || 'Invalid parameters';
                          }
                        })()}
                      </pre>
                    </div>
                    
                    {/* Mostrar los resultados de productos */}
                    <div className="mt-4">
                      <ProductResults toolCall={toolCall} />
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400 italic text-center py-8">
                    Ask for products to see results here
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div>
            {/* Session Log Section */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Session Log</h2>
              <div className="overflow-y-auto max-h-[600px]">
                {logs && logs.length > 0 ? (
                  logs.map((log, index) => (
                    <div key={index} className="mb-3 p-2 border-b">
                      {log ? (
                        <>
                          <div className="text-xs text-gray-500 mb-1 flex justify-between">
                            <span>{log.type}</span>
                            <span className="text-gray-400">{index + 1}</span>
                          </div>
                          <div>
                            {log.type === "text" ? (
                              <p>{log.text}</p>
                            ) : log.type === "function_call" ? (
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">function</span>
                                  <p className="font-medium">{log.name}</p>
                                </div>
                                <pre className="text-xs bg-gray-50 p-2 mt-1 rounded overflow-x-auto">
                                  {log.arguments}
                                </pre>
                              </div>
                            ) : (
                              <p className="text-gray-500 italic">
                                Tipo de log no soportado: {log.type}
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-gray-500 italic">
                          Log entry missing or corrupted
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 italic text-center py-4">
                    No activity yet
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 