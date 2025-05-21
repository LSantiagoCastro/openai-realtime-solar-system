import { useState, useEffect } from "react";

type ProductResult = {
  name: string;
  category: string;
  color?: string;
  price: number;
  maxPrice?: number;
  imageUrl?: string;
};

// Mock product data
const mockProducts: ProductResult[] = [
  { name: "Classic Running Sneakers", category: "sneakers", color: "red", price: 79.99, imageUrl: "/images/red-sneakers.jpg" },
  { name: "Premium Training Shoes", category: "sneakers", color: "red", price: 99.99, imageUrl: "/images/red-sneakers-2.jpg" },
  { name: "Lightweight Running Shoes", category: "sneakers", color: "red", price: 89.99, imageUrl: "/images/red-sneakers.jpg" },
  { name: "Casual Canvas Shoes", category: "sneakers", color: "blue", price: 49.99, imageUrl: "/images/blue-sneakers.jpg" },
  { name: "Cotton T-Shirt", category: "shirts", color: "pink", price: 19.99, imageUrl: "/images/pink-shirt-men.jpg" },
  { name: "Designer Luxury Shirt", category: "shirts", color: "black", price: 129.99, imageUrl: "/images/black-gucci-shirt-men.jpg" },
  { name: "Classic Oxford Shirt", category: "shirts", color: "white", price: 49.99 },
  { name: "Leather Jacket", category: "jackets", color: "black", price: 149.99 },
  { name: "Winter Parka", category: "jackets", color: "black", price: 199.99 },
];

type ProductResultsProps = {
  toolCall: any;
};

// Mapeo de términos en español a inglés
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

export default function ProductResults({ toolCall }: ProductResultsProps) {
  const [results, setResults] = useState<ProductResult[]>([]);

  useEffect(() => {
    if (toolCall && toolCall.name === "filter_products") {
      try {
        console.log("ProductResults received toolCall:", toolCall);
        
        // Primero, intentar extraer el objeto de argumentos
        let args;
        try {
          if (typeof toolCall.arguments === 'string') {
            console.log("Raw arguments string:", toolCall.arguments);
            args = JSON.parse(toolCall.arguments);
          } else if (typeof toolCall.arguments === 'object') {
            args = toolCall.arguments;
          } else {
            console.error("Unexpected arguments format:", typeof toolCall.arguments);
            args = { category: "sneakers", color: "red" }; // Fallback por defecto
          }
        } catch (e) {
          console.error("Error parsing JSON:", e);
          
          // Intento de recuperación para strings con formato incorrecto
          if (typeof toolCall.arguments === 'string') {
            const argString = toolCall.arguments;
            
            // Intentar extraer categoría y color de la cadena
            const categoryMatch = argString.match(/category["']?\s*[:=]\s*["']?([^"',}]+)["']?/i);
            const colorMatch = argString.match(/color["']?\s*[:=]\s*["']?([^"',}]+)["']?/i);
            
            const category = categoryMatch ? categoryMatch[1].trim() : "sneakers";
            const color = colorMatch ? colorMatch[1].trim() : "red";
            
            console.log("Extracted from string:", { category, color });
            args = { category, color };
          } else {
            args = { category: "sneakers", color: "red" }; // Fallback por defecto
          }
        }
        
        console.log("Parsed arguments:", args);
        
        // Usar los argumentos extraídos para filtrar
        if (args) {
          filterProducts(args);
        }
      } catch (e) {
        console.error("Failed to process tool call in ProductResults:", e);
        
        // En caso de error, mostrar algunos productos predeterminados
        filterProducts({ category: "sneakers", color: "red" });
      }
    }
  }, [toolCall]);

  const filterProducts = (filters: any) => {
    let filtered = [...mockProducts];
    console.log("Filtering with raw filters:", filters);

    // Filter by category
    if (filters.category) {
      const categoryToSearch = categoryMapping[filters.category.toLowerCase()] || filters.category.toLowerCase();
      console.log("Searching for category:", categoryToSearch);
      
      filtered = filtered.filter(p => 
        p.category.toLowerCase() === categoryToSearch
      );
    }

    // Filter by color
    if (filters.color) {
      const colorToSearch = colorMapping[filters.color.toLowerCase()] || filters.color.toLowerCase();
      console.log("Searching for color:", colorToSearch);
      
      filtered = filtered.filter(p => 
        p.color && p.color.toLowerCase() === colorToSearch
      );
    }

    // Filter by max price
    if (filters.max_price) {
      filtered = filtered.filter(p => p.price <= filters.max_price);
    }

    console.log("Found products:", filtered.length);
    setResults(filtered);
  };

  if (!results.length) {
    return (
      <div className="p-4 bg-yellow-50 rounded-md">
        <p className="text-yellow-700">No se encontraron productos que coincidan con tu búsqueda.</p>
        <p className="text-sm text-gray-500 mt-2">Intenta con otros términos de búsqueda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg">
        Encontrados: {results.length} {results[0].category === "sneakers" ? "zapatillas" : results[0].category} 
        {results[0].color ? ` ${results[0].color === "red" ? "rojas" : results[0].color}` : ""}
        {results[0].maxPrice ? ` menos de $${results[0].maxPrice}` : ""}
      </h3>
      
      {/* Debug info */}
      <div className="p-2 bg-gray-100 rounded text-xs mb-2">
        <p>Debug: {results.length} productos encontrados</p>
        <p>Primer producto: {JSON.stringify(results[0])}</p>
      </div>
      
      <div className="space-y-3 max-h-96 overflow-auto pr-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {results.map((product, i) => (
          <div key={i} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-16 h-16 rounded flex items-center justify-center mr-3" 
                   style={product.imageUrl ? {} : {backgroundColor: product.color || '#e5e7eb'}}>
                {product.imageUrl ? (
                  <img 
                    src={product.imageUrl} 
                    alt={product.name} 
                    className="w-full h-full object-cover rounded" 
                    onError={(e) => {
                      console.error('Error loading image:', product.imageUrl);
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.style.backgroundColor = product.color || '#e5e7eb';
                      e.currentTarget.parentElement!.innerHTML = `<div class="text-xs text-white text-center font-medium">${product.category.substr(0, 3).toUpperCase()}</div>`;
                    }}
                  />
                ) : (
                  <div className="text-xs text-white text-center font-medium">
                    {product.category.substr(0, 3).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <p className="font-medium">{product.name}</p>
                <p className="text-green-700 font-medium">${product.price.toFixed(2)}</p>
                <p className="text-xs text-gray-500">{product.color}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 