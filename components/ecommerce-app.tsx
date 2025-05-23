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

// Añadir un tipo para el historial de búsqueda
type SearchHistoryItem = {
  id: string;
  timestamp: Date;
  query: string;
  filters: {
    category?: string;
    color?: string;
    maxPrice?: number;
  };
  imageUrl?: string; // Añadir campo para la URL de la imagen
};

export default function EcommerceApp() {
  const [logs, setLogs] = useState<any[]>([]);
  const [toolCall, setToolCall] = useState<any>(null);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  // Agregar estado para el historial de búsquedas
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);

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

        // Añadir al historial de búsquedas cuando se filtra productos
        if (toolCall.name === "filter_products" && args) {
          // Obtener la URL de la imagen basada en los filtros de búsqueda
          let imageUrl = "/images/default-product.jpg"; // Imagen por defecto
          
          // Importar el mismo conjunto de datos de productos del componente ProductResults
          const mockProducts = [
            { name: "Classic Running Sneakers", category: "sneakers", color: "red", price: 79.99, imageUrl: "/images/red-sneakers.jpg" },
            { name: "Premium Training Shoes", category: "sneakers", color: "red", price: 99.99, imageUrl: "/images/red-sneakers-2.jpg" },
            { name: "Lightweight Running Shoes", category: "sneakers", color: "red", price: 89.99, imageUrl: "/images/red-sneakers.jpg" },
            { name: "Casual Canvas Shoes", category: "sneakers", color: "blue", price: 49.99, imageUrl: "/images/blue-sneakers.jpg" },
            { name: "Cotton T-Shirt", category: "shirts", color: "pink", price: 19.99, imageUrl: "/images/pink-shirt-men.jpg" },
            { name: "Designer Luxury Shirt", category: "shirts", color: "black", price: 129.99, imageUrl: "/images/black-gucci-shirt-men.jpg" },
            { name: "Classic Oxford Shirt", category: "shirts", color: "white", price: 49.99, imageUrl: "/images/white-shirt-men.jpg" },
            { name: "Leather Jacket", category: "jackets", color: "black", price: 149.99, imageUrl: "/images/black-jacket.jpg" },
            { name: "Winter Parka", category: "jackets", color: "black", price: 199.99, imageUrl: "/images/winter-parka-black.jpg" },
          ];
          
          // Mapeo de términos en español a inglés para categoría y color
          const categoryMapping: Record<string, string> = {
            "zapatillas": "sneakers",
            "zapatilla": "sneakers",
            "tenis": "sneakers",
            "calzado deportivo": "sneakers",
            "camisas": "shirts",
            "camisa": "shirts",
            "playera": "shirts",
            "polera": "shirts",
            "remera": "shirts",
            "chaquetas": "jackets",
            "chaqueta": "jackets",
            "abrigo": "jackets",
            "chamarra": "jackets"
          };
          
          const colorMapping: Record<string, string> = {
            "rojas": "red",
            "rojo": "red",
            "azules": "blue",
            "azul": "blue",
            "blancas": "white",
            "blanco": "white",
            "negras": "black",
            "negro": "black",
            "rosadas": "pink",
            "rosa": "pink",
            "rosado": "pink"
          };
          
          // Convertir argumentos a sus equivalentes en inglés para la búsqueda
          const category = args.category ? 
            (categoryMapping[args.category.toLowerCase()] || args.category.toLowerCase()) : '';
          const color = args.color ? 
            (colorMapping[args.color.toLowerCase()] || args.color.toLowerCase()) : '';
          
          // Filtrar productos según los mismos criterios del carrusel
          let filtered = [...mockProducts];
          
          if (category) {
            filtered = filtered.filter(p => p.category.toLowerCase() === category);
          }
          
          if (color) {
            filtered = filtered.filter(p => p.color && p.color.toLowerCase() === color);
          }
          
          if (args.max_price) {
            filtered = filtered.filter(p => p.price <= args.max_price);
          }
          
          // Obtener la URL de la imagen del primer producto filtrado
          if (filtered.length > 0 && filtered[0].imageUrl) {
            imageUrl = filtered[0].imageUrl;
            console.log("Using image from filtered product:", imageUrl);
          }
          
          const newHistoryItem: SearchHistoryItem = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            query: transcript,
            filters: {
              category: args.category || undefined,
              color: args.color || undefined,
              maxPrice: args.max_price || undefined
            },
            imageUrl: imageUrl // Usar la imagen del producto filtrado
          };
          
          setSearchHistory(prev => [newHistoryItem, ...prev]);
        }

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
  }, [dataChannel, sendClientEvent, transcript]);

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
    stopSession();
    setToolCall(null);
    setLogs([]);
    setSearchHistory([]);
  };

  return (
    <div className="relative min-h-screen bg-gray-100">
      <div className="p-4 max-w-6xl mx-auto">
        <header className="mb-6 text-center">
          <div className="flex items-center justify-center gap-4 mb-3">
            <img src="/icon.png" alt="Shopping Assistant Icon" className="w-16 h-16" />
            <h1 className="text-3xl font-bold">Voice Shopping Assistant</h1>
          </div>
          <p className="text-gray-600">Navega el catálogo con tu voz - prueba diciendo "Muéstrame zapatillas rojas"</p>
        </header>
        
        {/* Sección principal - Carrusel primero */}
        <section className="mb-8">
          {toolCall?.name === "filter_products" ? (
            <ProductResults toolCall={toolCall} />
          ) : (
            <ProductResults toolCall={null} />
          )}
        </section>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Tu solicitud por voz</h2>
              <div className="p-4 bg-gray-50 rounded-md min-h-36 mb-4">
                {transcript ? (
                  <p>{transcript}</p>
                ) : (
                  <p className="text-gray-400 italic">
                    Presiona el botón del micrófono y comienza a hablar...
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
                  {isSessionActive ? "Desconectar" : "Conectar"}
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
                  {isListening ? "Silenciar" : "Hablar"}
                </button>
                
                <button
                  onClick={handleResetClick}
                  className="px-4 py-2 rounded-full font-medium bg-gray-200 hover:bg-gray-300"
                >
                  Reiniciar
                </button>
              </div>
            </div>
          </div>
          
          <div>
            {/* Session Log Section */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Registro de Sesión</h2>
              <div className="overflow-y-auto max-h-[300px]">
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
                          Entrada de registro faltante o corrupta
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 italic text-center py-4">
                    No hay actividad todavía
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Historial de búsquedas */}
        {searchHistory.length > 0 && (
          <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Historial de búsquedas</h2>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {searchHistory.map((item) => (
                <div 
                  key={item.id} 
                  className="p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <div className="flex items-start">
                    {/* Imagen del producto */}
                    {item.imageUrl && (
                      <div className="w-16 h-16 rounded overflow-hidden flex-shrink-0 mr-3 bg-white border">
                        <img 
                          src={item.imageUrl} 
                          alt="Product image"
                          className="w-full h-full object-cover" 
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.innerHTML = `
                              <div class="w-full h-full flex items-center justify-center bg-gray-200">
                                <span class="text-xs text-gray-500">No image</span>
                              </div>
                            `;
                          }}
                        />
                      </div>
                    )}
                    
                    <div className="flex-grow">
                      <p className="text-sm text-gray-500">
                        {item.timestamp.toLocaleTimeString()}
                      </p>
                      <p className="font-medium">{item.query}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {item.filters.category && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                            {item.filters.category}
                          </span>
                        )}
                        {item.filters.color && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                            {item.filters.color}
                          </span>
                        )}
                        {item.filters.maxPrice && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                            &lt; ${item.filters.maxPrice}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 