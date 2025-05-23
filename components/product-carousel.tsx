import React, { useState, useEffect, useRef } from 'react';

type ProductCarouselProps = {
  products: Array<{
    name: string;
    category: string;
    color?: string;
    price: number;
    imageUrl?: string;
  }>;
  highlighted: string[]; // IDs de productos destacados
};

const ProductCarousel: React.FC<ProductCarouselProps> = ({ products, highlighted }) => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);

  // Detiene la rotación automática cuando hay productos destacados
  useEffect(() => {
    if (highlighted.length > 0) {
      setAutoRotate(false);
    } else {
      setAutoRotate(true);
    }
  }, [highlighted]);

  // Rotación automática
  useEffect(() => {
    let animationId: number;
    
    const rotate = () => {
      if (autoRotate && !isDragging) {
        setRotation(prev => (prev + 0.2) % 360);
      }
      animationId = requestAnimationFrame(rotate);
    };
    
    rotate();
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [autoRotate, isDragging]);

  // Gestionar el arrastre con mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setAutoRotate(false);
    setStartX(e.clientX);
    setCurrentX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setCurrentX(e.clientX);
      const delta = currentX - startX;
      setRotation(prev => (prev + delta * 0.2) % 360);
      setStartX(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (highlighted.length === 0) {
      setAutoRotate(true);
    }
  };

  // Soporte para pantallas táctiles
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setAutoRotate(false);
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging) {
      const touchCurrentX = e.touches[0].clientX;
      const delta = touchCurrentX - touchStartX;
      setRotation(prev => (prev + delta * 0.2) % 360);
      setTouchStartX(touchCurrentX);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (highlighted.length === 0) {
      setAutoRotate(true);
    }
  };

  // Calcular ángulo para cada producto
  const getProductStyles = (index: number) => {
    const angleIncrement = 360 / products.length;
    const angle = (rotation + index * angleIncrement) % 360;
    const radians = (angle * Math.PI) / 180;
    const radius = 250; // Aumentar el radio del carrusel
    
    const x = radius * Math.sin(radians);
    const z = radius * Math.cos(radians);
    
    // Calcular escala para efecto de profundidad
    const scale = 0.6 + (Math.cos(radians) + 1) / 4; // Aumentar la escala base
    
    // Calcular opacidad para productos no destacados
    const isHighlighted = highlighted.includes(String(index)) || highlighted.length === 0;
    const opacity = isHighlighted ? 1 : 0.3;
    
    // Calcular z-index para controlar qué productos están visualmente por encima
    const zIndex = Math.floor(100 - (Math.cos(radians) * 100));
    
    return {
      transform: `translateX(${x}px) translateZ(${z}px) rotateY(${-angle}deg) scale(${scale})`,
      opacity,
      zIndex,
      filter: isHighlighted ? 'none' : 'grayscale(50%)',
      transition: isDragging ? 'none' : 'all 0.3s ease-out'
    };
  };

  // Enfocar productos destacados
  useEffect(() => {
    if (highlighted.length > 0 && products.length > 0) {
      const highlightedIndex = parseInt(highlighted[0]);
      if (!isNaN(highlightedIndex) && highlightedIndex < products.length) {
        const angleIncrement = 360 / products.length;
        const targetRotation = -angleIncrement * highlightedIndex;
        setRotation(targetRotation);
      }
    }
  }, [highlighted, products]);

  return (
    <div className="relative w-full h-[600px] flex items-center justify-center overflow-hidden bg-gradient-to-b from-blue-50 to-gray-100 rounded-xl shadow-inner">
      <div 
        className="carousel-container perspective-1000"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        ref={carouselRef}
      >
        {products.map((product, index) => (
          <div
            key={index}
            className={`absolute product-card ${highlighted.includes(String(index)) ? 'highlight-pulse' : ''}`}
            style={{
              ...getProductStyles(index),
              width: '220px', // Aumentar ancho
              height: '300px', // Aumentar altura
              transformOrigin: 'center center',
              position: 'absolute',
              top: '50%',
              left: '50%',
              marginLeft: '-110px', // La mitad del ancho
              marginTop: '-150px', // La mitad de la altura
              backfaceVisibility: 'hidden',
              boxShadow: highlighted.includes(String(index)) 
                ? '0 0 30px rgba(59, 130, 246, 0.8)' 
                : '0 4px 15px rgba(0,0,0,0.2)'
            }}
          >
            <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col shadow-lg">
              <div 
                className="h-[180px] bg-gray-100 flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: product.color || '#f3f4f6' }}
              >
                {product.imageUrl ? (
                  <img 
                    src={product.imageUrl} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML += `<div class="flex items-center justify-center h-full">
                        <span class="text-3xl font-bold text-white">${product.category.charAt(0).toUpperCase()}</span>
                      </div>`;
                    }}
                  />
                ) : (
                  <span className="text-3xl font-bold text-white">
                    {product.category.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="p-4 flex-grow flex flex-col justify-between">
                <h3 className="font-medium text-base truncate">{product.name}</h3>
                <div className="mt-2">
                  <p className="text-green-700 font-bold text-lg">${product.price.toFixed(2)}</p>
                  <div className="flex items-center mt-2">
                    {product.color && (
                      <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                        {product.color}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Título del carrusel */}
      <div className="absolute top-4 left-0 right-0 text-center">
        <h2 className="text-2xl font-bold text-gray-800">Catálogo de Productos</h2>
        <p className="text-gray-600 mt-1">
          {highlighted.length > 0 
            ? `${highlighted.length} productos destacados` 
            : 'Explora nuestros productos usando tu voz'}
        </p>
      </div>
      
      {/* Controles adicionales */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-6">
        <button 
          className="p-3 bg-white rounded-full shadow-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          onClick={() => setRotation(prev => prev - 36)}
          aria-label="Girar a la izquierda"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <button 
          className="p-3 bg-white rounded-full shadow-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          onClick={() => setRotation(prev => prev + 36)}
          aria-label="Girar a la derecha"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
      
      {/* Estilos globales para la perspectiva */}
      <style jsx global>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        
        .product-card {
          transition: transform 0.3s ease, opacity 0.3s ease, filter 0.3s ease;
        }
        
        .product-card:hover {
          transform: scale(1.05) translateZ(50px) !important;
          z-index: 1000 !important;
          box-shadow: 0 15px 30px rgba(0, 0, 0, 0.3) !important;
        }
        
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          70% { box-shadow: 0 0 0 20px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
      `}</style>
    </div>
  );
};

export default ProductCarousel; 