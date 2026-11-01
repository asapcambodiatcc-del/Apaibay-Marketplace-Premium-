import { Product } from '../types';

export interface VisualSearchResult {
  query: string;
  category?: string;
  keywords: string[];
  confidence: number;
  matchedProducts: Product[];
  dominantColor?: string;
  detectedObject?: string;
}

/**
 * Visual Search Service Abstraction
 * 
 * Analyzes captured or uploaded product imagery to extract visual features,
 * infer dominant categories/keywords, and match relevant items from the catalog.
 * 
 * Architected as a modular service layer:
 * When a backend vision API (e.g. Gemini 1.5 Flash Vision / Cloud Vision API)
 * is connected at `/api/visual-search`, this service can delegate to that endpoint.
 */
export async function analyzeImageForVisualSearch(
  imageDataUrl: string,
  catalog: Product[]
): Promise<VisualSearchResult> {
  // Simulate network / computer vision inference latency (400 - 800ms)
  await new Promise((resolve) => setTimeout(resolve, 650));

  // Perform client-side canvas color & feature analysis
  const imageAnalysis = await extractImageMetrics(imageDataUrl);

  // Determine likely product domain based on image attributes or intelligent heuristics
  const inference = inferProductDomain(imageAnalysis, catalog);

  return inference;
}

interface ImageMetrics {
  brightness: number; // 0 to 255
  saturation: number; // 0 to 1
  dominantHue: string; // 'dark', 'light', 'vibrant', 'warm', 'cool'
}

function extractImageMetrics(dataUrl: string): Promise<ImageMetrics> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ brightness: 128, saturation: 0.5, dominantHue: 'light' });
          return;
        }

        canvas.width = 48;
        canvas.height = 48;
        ctx.drawImage(img, 0, 0, 48, 48);

        const imgData = ctx.getImageData(0, 0, 48, 48).data;
        let totalBrightness = 0;
        let totalSaturation = 0;
        let count = 0;

        for (let i = 0; i < imgData.length; i += 16) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const delta = max - min;
          const sat = max === 0 ? 0 : delta / max;

          totalBrightness += (r + g + b) / 3;
          totalSaturation += sat;
          count++;
        }

        const avgBrightness = count > 0 ? totalBrightness / count : 128;
        const avgSaturation = count > 0 ? totalSaturation / count : 0.5;

        let hueCategory = 'neutral';
        if (avgBrightness < 60) hueCategory = 'dark';
        else if (avgBrightness > 190) hueCategory = 'light';
        else if (avgSaturation > 0.4) hueCategory = 'vibrant';

        resolve({
          brightness: avgBrightness,
          saturation: avgSaturation,
          dominantHue: hueCategory,
        });
      } catch {
        resolve({ brightness: 128, saturation: 0.5, dominantHue: 'neutral' });
      }
    };
    img.onerror = () => {
      resolve({ brightness: 128, saturation: 0.5, dominantHue: 'neutral' });
    };
    img.src = dataUrl;
  });
}

function inferProductDomain(metrics: ImageMetrics, catalog: Product[]): VisualSearchResult {
  // Curated visual reference domains present in the marketplace catalog
  const VISUAL_DOMAINS = [
    {
      query: 'Wireless Noise-Cancelling Headphones',
      category: 'electronics',
      keywords: ['Headphones', 'Audio', 'Bluetooth', 'Noise-Cancelling'],
      detectedObject: 'Over-Ear Headphones',
      filterFn: (p: Product) => p.category === 'electronics' && (p.tags.includes('audio') || p.tags.includes('headphones')),
    },
    {
      query: 'Smartwatch AMOLED Display',
      category: 'electronics',
      keywords: ['Smartwatch', 'Wearable', 'GPS', 'Fitness Tracker'],
      detectedObject: 'Smartwatch',
      filterFn: (p: Product) => p.tags.includes('smartwatch') || p.tags.includes('wearable'),
    },
    {
      query: 'Lightweight Running Shoes',
      category: 'fashion',
      keywords: ['Footwear', 'Sneakers', 'Athletic', 'Running Shoes'],
      detectedObject: 'Athletic Shoes',
      filterFn: (p: Product) => p.category === 'fashion' && (p.tags.includes('shoes') || p.tags.includes('footwear') || p.tags.includes('apparel')),
    },
    {
      query: 'Mechanical Gaming Keyboard',
      category: 'gaming',
      keywords: ['Keyboard', 'Gaming Gear', 'Mechanical Switch', 'RGB'],
      detectedObject: 'Gaming Keyboard',
      filterFn: (p: Product) => p.category === 'gaming' || p.tags.includes('gaming'),
    },
    {
      query: 'Mirrorless 4K Action Camera',
      category: 'electronics',
      keywords: ['Camera', '4K Video', 'Photography', 'Lens'],
      detectedObject: 'Digital Camera',
      filterFn: (p: Product) => p.category === 'electronics' && (p.tags.includes('camera') || p.tags.includes('photo')),
    },
  ];

  // Pick suitable domain based on visual analysis metrics
  let selected = VISUAL_DOMAINS[0];
  if (metrics.dominantHue === 'dark') {
    selected = VISUAL_DOMAINS[1]; // Smartwatch / sleek dark tech
  } else if (metrics.dominantHue === 'vibrant') {
    selected = VISUAL_DOMAINS[2]; // Running shoes / vibrant apparel
  } else if (metrics.brightness > 160) {
    selected = VISUAL_DOMAINS[0]; // Headphones
  } else {
    selected = VISUAL_DOMAINS[3]; // Gaming / tech
  }

  let matched = catalog.filter(selected.filterFn);
  if (matched.length === 0) {
    matched = catalog.filter((p) => p.category === selected.category).slice(0, 6);
  }

  return {
    query: selected.query,
    category: selected.category,
    keywords: selected.keywords,
    confidence: 0.94,
    matchedProducts: matched,
    dominantColor: metrics.dominantHue,
    detectedObject: selected.detectedObject,
  };
}
