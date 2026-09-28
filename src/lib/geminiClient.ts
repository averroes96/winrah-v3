// ============================================================================
// WINRAH - Gemini Vision Client Engine
// Direct client-side multimodal reasoning for shoe warehouse operations
// Supports:
// 1. AI Section Scanner (Auto-identify models, size ranges, box & shoe colors)
// 2. AI Cycle Count (Count pairs per model with size x color breakdown)
// ============================================================================

import { ShoeModel, InventoryModelSnapshot } from '../types';

export const GEMINI_STORAGE_KEY = 'winrah_gemini_api_key';
export const GEMINI_MODEL_KEY = 'winrah_gemini_model';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export interface AiExtractedModel {
  reference_code: string;
  size_range?: string | null;
  box_color?: string | null;
  available_colors?: string[] | null;
  notes?: string | null;
}

export interface AiScanSectionResult {
  models: AiExtractedModel[];
  confidence: 'high' | 'medium' | 'low';
  notes?: string | null;
}

export interface AiCycleCountResult {
  models: InventoryModelSnapshot[];
  total_models: number;
  total_pairs: number;
  confidence: 'high' | 'medium' | 'low';
  notes?: string | null;
}

export interface AiExtractedDeliveryItem {
  reference_code: string;
  location?: string | null;
  product_name?: string | null;
}

export interface AiDeliverySlipResult {
  items: AiExtractedDeliveryItem[];
  confidence: 'high' | 'medium' | 'low';
  total_detected: number;
  notes?: string | null;
}

/**
 * Retrieve saved Gemini settings from device localStorage.
 */
export function getGeminiConfig(): GeminiConfig | null {
  const apiKey = localStorage.getItem(GEMINI_STORAGE_KEY)?.trim();
  if (!apiKey) return null;
  let model = localStorage.getItem(GEMINI_MODEL_KEY)?.trim() || DEFAULT_GEMINI_MODEL;
  // Automatically migrate deprecated 2.0 or 2.5 models if saved in localStorage
  if (model === 'gemini-2.0-flash' || model === 'gemini-2.5-flash') {
    model = DEFAULT_GEMINI_MODEL;
    localStorage.setItem(GEMINI_MODEL_KEY, model);
  }
  return { apiKey, model };
}

/**
 * Save Gemini configuration to localStorage.
 */
export function setGeminiConfig(apiKey: string, model: string = DEFAULT_GEMINI_MODEL): void {
  localStorage.setItem(GEMINI_STORAGE_KEY, apiKey.trim());
  localStorage.setItem(GEMINI_MODEL_KEY, model.trim() || DEFAULT_GEMINI_MODEL);
}

/**
 * Clear stored Gemini credentials.
 */
export function clearGeminiConfig(): void {
  localStorage.removeItem(GEMINI_STORAGE_KEY);
  localStorage.removeItem(GEMINI_MODEL_KEY);
}

/**
 * Resizes an image file to a maximum dimension while maintaining aspect ratio
 * and compress to JPEG format to optimize upload latency without degrading OCR.
 */
export async function optimizeImageForVision(
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not create canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Test connectivity with the Gemini API using the provided or stored key.
 */
export async function testGeminiConnection(
  apiKeyOverride?: string,
  modelOverride?: string
): Promise<{ success: boolean; message: string }> {
  const cfg = apiKeyOverride
    ? { apiKey: apiKeyOverride.trim(), model: modelOverride || DEFAULT_GEMINI_MODEL }
    : getGeminiConfig();

  if (!cfg?.apiKey) {
    return { success: false, message: 'Aucune clé API Gemini configurée.' };
  }

  const modelName = (cfg.model || DEFAULT_GEMINI_MODEL).replace(/^models\//, '').trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: 'Respond with the single word: OK' }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 10,
        },
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const detail = errJson?.error?.message || `HTTP ${res.status} ${res.statusText}`;
      return { success: false, message: `Erreur API Gemini: ${detail}` };
    }

    return { success: true, message: 'Connexion à l\'API Gemini établie avec succès !' };
  } catch (err: any) {
    return {
      success: false,
      message: err.message?.includes('Failed to fetch')
        ? 'Impossible de joindre Google Gemini. Vérifiez votre connexion Internet.'
        : `Erreur: ${err.message}`,
    };
  }
}

/**
 * FEATURE 1: Scan Section Photos
 * Instructs Gemini to detect shoe boxes and extract REF, COLOR, SIZE from sticker labels.
 */
export async function scanSectionPhotos(
  images: File[],
  sectionName?: string
): Promise<AiScanSectionResult> {
  const config = getGeminiConfig();
  if (!config) {
    throw new Error('Clé API Gemini non configurée. Veuillez l\'ajouter dans les Paramètres.');
  }

  if (images.length === 0) {
    throw new Error('Veuillez fournir au moins une photo du rayon.');
  }

  // Optimize & base64 encode all images in parallel
  const encodedImages = await Promise.all(
    images.map((img) => optimizeImageForVision(img, 1600, 0.85))
  );

  const imageParts = encodedImages.map((img) => ({
    inlineData: {
      data: img.base64,
      mimeType: img.mimeType,
    },
  }));

  const systemPrompt = `You are a high-precision computer vision model specialized in shoe warehouse inventory.
You are inspecting shelf photos for section "${sectionName || 'Inconnu'}".

KEY DOMAIN KNOWLEDGE:
In this warehouse, each shoe box typically has an adhesive sticker/label formatted as:
"REF | COLOR | SIZE" (or similar sticker layout showing Reference, Color, and Pointure/Size).
Example sticker: "HS-21 | NOIR | 39" or "HS-21 | 36/41".

YOUR TASK:
1. Examine all shoe boxes and shoes visible on the shelf.
2. Read the sticker label on each box to extract:
   - reference_code: The exact reference/model code (e.g. "HS-21", "808", "Z-04").
   - size_range: The size range (e.g. "36/41", "40/45") or specific size observed.
   - box_color: The color of the cardboard box itself (e.g. "noir", "blanc", "kraft/marron", "bleu", "rouge").
   - available_colors: Array of shoe colors identified for this model (from sticker text or visible shoes).
3. If multiple boxes share the same reference, aggregate their observed colors into one distinct entry.
4. If a box sticker is partially obscured or unreadable, do NOT invent a reference. Put "???" for uncertain references.

Return ONLY a valid JSON object matching this schema:
{
  "models": [
    {
      "reference_code": "HS-21",
      "size_range": "36/41",
      "box_color": "marron",
      "available_colors": ["noir", "blanc"],
      "notes": "visible on shelf level 2"
    }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "optional overall observations"
}`;

  const modelName = (config.model || DEFAULT_GEMINI_MODEL).replace(/^models\//, '').trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [...imageParts, { text: systemPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    const detail = errJson?.error?.message || `HTTP ${response.status} ${response.statusText}`;
    throw new Error(`Erreur API Gemini: ${detail}`);
  }

  const jsonResult = await response.json();
  const textContent = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Réponse vide de l\'API Gemini.');
  }

  try {
    const parsed = JSON.parse(textContent) as AiScanSectionResult;
    return {
      models: Array.isArray(parsed.models) ? parsed.models : [],
      confidence: parsed.confidence || 'medium',
      notes: parsed.notes || null,
    };
  } catch (err: any) {
    console.error('Failed to parse Gemini JSON output:', textContent, err);
    throw new Error('Impossible de lire la structure JSON retournée par Gemini.');
  }
}

/**
 * FEATURE 2: Cycle Count Section Photos
 * Instructs Gemini to count physical pairs for each reference and break down by size and color.
 */
export async function cycleCountSectionPhotos(
  images: File[],
  existingModels: ShoeModel[],
  sectionName?: string
): Promise<AiCycleCountResult> {
  const config = getGeminiConfig();
  if (!config) {
    throw new Error('Clé API Gemini non configurée. Veuillez l\'ajouter dans les Paramètres.');
  }

  if (images.length === 0) {
    throw new Error('Veuillez fournir au moins une photo du rayon.');
  }

  const encodedImages = await Promise.all(
    images.map((img) => optimizeImageForVision(img, 1600, 0.85))
  );

  const imageParts = encodedImages.map((img) => ({
    inlineData: {
      data: img.base64,
      mimeType: img.mimeType,
    },
  }));

  const knownRefs = existingModels.map((m) => ({
    reference: m.reference_code,
    size_range: m.size_range || null,
    box_color: m.box_color || null,
  }));

  const systemPrompt = `You are performing an automated physical inventory cycle count of shoe boxes in warehouse section "${
    sectionName || 'Inconnu'
  }".

KEY DOMAIN KNOWLEDGE:
In this warehouse, each shoe box typically has an adhesive sticker/label formatted as:
"REF | COLOR | SIZE" (e.g. "HS-21 | NOIR | 39").
Use these stickers to identify the exact reference, color, and size of every box.

KNOWN REGISTERED MODELS IN THIS WAREHOUSE (use for reference code matching):
${JSON.stringify(knownRefs.slice(0, 100), null, 2)}

YOUR TASK:
1. Count EVERY visible shoe box on the shelves.
2. Group the counts by model reference_code.
3. For each model, break down the count by individual size and color as read from the stickers or visible items.
4. Calculate the total pairs visible for each model and overall.

Return ONLY a valid JSON object matching this schema:
{
  "models": [
    {
      "reference_code": "HS-21",
      "total_pairs": 12,
      "details": [
        { "size": "38", "color": "noir", "quantity": 3 },
        { "size": "39", "color": "noir", "quantity": 5 },
        { "size": "40", "color": "blanc", "quantity": 4 }
      ]
    }
  ],
  "total_models": 1,
  "total_pairs": 12,
  "confidence": "high" | "medium" | "low",
  "notes": "optional observations (e.g. 2 boxes were partially hidden behind a pillar)"
}`;

  const modelName = (config.model || DEFAULT_GEMINI_MODEL).replace(/^models\//, '').trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [...imageParts, { text: systemPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    const detail = errJson?.error?.message || `HTTP ${response.status} ${response.statusText}`;
    throw new Error(`Erreur API Gemini: ${detail}`);
  }

  const jsonResult = await response.json();
  const textContent = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Réponse vide de l\'API Gemini.');
  }

  try {
    const parsed = JSON.parse(textContent) as AiCycleCountResult;

    // Link model_id if matching existing model
    const normalizedModels = (parsed.models || []).map((item) => {
      const match = existingModels.find(
        (m) =>
          (m.reference_code || '').trim().toUpperCase() ===
          (item.reference_code || '').trim().toUpperCase()
      );
      return {
        ...item,
        model_id: match ? match.id : null,
      };
    });

    const totalPairs =
      parsed.total_pairs ||
      normalizedModels.reduce((acc, m) => acc + (m.total_pairs || 0), 0);

    return {
      models: normalizedModels,
      total_models: normalizedModels.length,
      total_pairs: totalPairs,
      confidence: parsed.confidence || 'medium',
      notes: parsed.notes || null,
    };
  } catch (err: any) {
    console.error('Failed to parse Gemini Cycle Count JSON output:', textContent, err);
    throw new Error('Impossible de lire la structure JSON de comptage retournée par Gemini.');
  }
}

/**
 * FEATURE 3: Delivery Slip Multi-Model & Location Extractor
 * Analyzes photos of delivery slips ("Bon de livraison", "Facture") to extract
 * printed reference codes and their adjacent handwritten shelf/location notations.
 */
export async function extractModelsFromDeliverySlip(
  images: File[]
): Promise<AiDeliverySlipResult> {
  const config = getGeminiConfig();
  if (!config) {
    throw new Error('Clé API Gemini non configurée. Veuillez l\'ajouter dans les Paramètres.');
  }

  if (images.length === 0) {
    throw new Error('Veuillez fournir au moins une photo du bon de livraison.');
  }

  // Optimize & base64 encode all images with high resolution for crisp text OCR
  const encodedImages = await Promise.all(
    images.map((img) => optimizeImageForVision(img, 1800, 0.88))
  );

  const imageParts = encodedImages.map((img) => ({
    inlineData: {
      data: img.base64,
      mimeType: img.mimeType,
    },
  }));

  const systemPrompt = `You are a high-precision computer vision AI specialized in shoe warehouse delivery receipts ("Bon de livraison", "Bordereau de réception", "Facture").

CONTEXT & LAYOUT:
The image shows a paper delivery slip with printed columns such as:
"Référence | Désignation du Produit | Point | Qte. (Cart.) | ...".
In this warehouse, next to each printed shoe reference code (e.g., "HS-55", "HS-72", "163-40", "A36", "TM124", "L-9B", "858-10", "311-3", "279-15"), the warehouse receiver or clerk writes the assigned warehouse shelf/location code by hand with a blue or black pen (for example: "C18", "C15", "C17", "C3", "C20", "C14", "C2", "C1", "C101", "C6", "C8", "C12", "C9", "C7", "C13", "C4", "C10", "C16", "C19", "C21", "C11", "C5", etc.).

CRITICAL NOTE ON MULTI-COLUMN LAYOUT:
Delivery slips frequently organize lines into multiple side-by-side vertical columns (e.g. left column lines 1 to 25, middle/right column lines 26 to 55).
You MUST inspect and extract items from ALL columns across the entire document from top to bottom. Do not miss any column!

YOUR EXACT EXTRACTION TASK:
Your ONLY concern is extracting:
1. reference_code: The printed shoe model reference (e.g. "HS-55", "HS-72", "163-40", "A36", "TM124", "L-9B", "858-10", "311-3", "279-15", etc.).
2. location: The corresponding handwritten (or printed) shelf/section code written next to the reference (e.g. "C18", "C15", "C6", "C101", "C4", "C1", etc.).
   - If no location is written for an item, set location to null.
   - If an item has an "X" or cross mark, still extract the reference and location.
3. product_name: The printed product designation/name (e.g. "BOOTS LUX 27", "BTS LUX 2027") if present, otherwise null.

Format requirements:
- Clean and normalize reference codes (e.g. uppercase, maintain hyphens like "HS-55").
- Clean and normalize location codes (e.g. "C18", "C1", "C101", remove extra punctuation or spaces).
- If multiple lines appear, list every single one in document order.

Return ONLY a valid JSON object matching this schema:
{
  "items": [
    {
      "reference_code": "HS-55",
      "location": "C18",
      "product_name": "BOOTS LUX 27"
    }
  ],
  "confidence": "high" | "medium" | "low",
  "total_detected": 1,
  "notes": "optional observations on legibility"
}`;

  const modelName = (config.model || DEFAULT_GEMINI_MODEL).replace(/^models\//, '').trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [...imageParts, { text: systemPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    const detail = errJson?.error?.message || `HTTP ${response.status} ${response.statusText}`;
    throw new Error(`Erreur API Gemini: ${detail}`);
  }

  const jsonResult = await response.json();
  const textContent = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Réponse vide de l\'API Gemini.');
  }

  try {
    const parsed = JSON.parse(textContent) as {
      items?: Array<{ reference_code?: string; location?: string | null; product_name?: string | null }>;
      confidence?: 'high' | 'medium' | 'low';
      total_detected?: number;
      notes?: string | null;
    };

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const normalizedItems: AiExtractedDeliveryItem[] = rawItems
      .filter((it) => it && (it.reference_code || '').trim().length > 0)
      .map((it) => {
        const cleanRef = (it.reference_code || '').trim().toUpperCase();
        const rawLoc = (it.location || '').trim().toUpperCase();
        // Clean location (remove trailing dots, crosses, etc.)
        const cleanLoc = rawLoc.replace(/[^A-Z0-9-]/g, '');

        return {
          reference_code: cleanRef,
          location: cleanLoc || null,
          product_name: (it.product_name || '').trim() || null,
        };
      });

    return {
      items: normalizedItems,
      confidence: parsed.confidence || 'medium',
      total_detected: normalizedItems.length,
      notes: parsed.notes || null,
    };
  } catch (err: any) {
    console.error('Failed to parse Gemini Delivery Slip JSON output:', textContent, err);
    throw new Error('Impossible de lire les données retournées par Gemini.');
  }
}
