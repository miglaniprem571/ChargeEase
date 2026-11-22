// =========================================================
// ChargeEase EV - Sarvam AI Multilingual & Voice Engine
// Integrates Sarvam Chat Completions, Bulbul TTS & Mayura Translate
// =========================================================

const SARVAM_BASE_URL = 'https://api.sarvam.ai';

const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)', ttsCode: 'en-IN', speaker: 'anushka', speechLocale: 'en-IN' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)', ttsCode: 'hi-IN', speaker: 'anushka', speechLocale: 'hi-IN' },
  { code: 'hinglish', label: 'Hinglish', ttsCode: 'hi-IN', speaker: 'anushka', speechLocale: 'hi-IN' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)', ttsCode: 'ta-IN', speaker: 'anushka', speechLocale: 'ta-IN' },
  { code: 'te-IN', label: 'తెలుగు (Telugu)', ttsCode: 'te-IN', speaker: 'anushka', speechLocale: 'te-IN' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (Kannada)', ttsCode: 'kn-IN', speaker: 'anushka', speechLocale: 'kn-IN' },
  { code: 'mr-IN', label: 'मराठी (Marathi)', ttsCode: 'mr-IN', speaker: 'anushka', speechLocale: 'mr-IN' },
  { code: 'bn-IN', label: 'বাংলা (Bengali)', ttsCode: 'bn-IN', speaker: 'anushka', speechLocale: 'bn-IN' },
  { code: 'gu-IN', label: 'ગુજરાતી (Gujarati)', ttsCode: 'gu-IN', speaker: 'anushka', speechLocale: 'gu-IN' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ (Punjabi)', ttsCode: 'pa-IN', speaker: 'anushka', speechLocale: 'pa-IN' }
];

function getApiKey() {
  return String(process.env.SARVAM_API_KEY || '').trim();
}

function isSarvamConfigured() {
  return getApiKey().length > 0;
}

function resolveLanguage(langCode) {
  const clean = String(langCode || 'hi-IN').trim();
  return SUPPORTED_LANGUAGES.find((l) => l.code === clean) || SUPPORTED_LANGUAGES[0];
}

function buildLanguageInstruction(langObj) {
  if (langObj.code === 'hinglish') {
    return 'Reply in natural, friendly Hinglish (Hindi written in Latin/English script mixed with EV terms like kWh, Type 2, wallet, booking). Keep it concise (3-4 sentences max) and immediately actionable.';
  }
  if (langObj.code === 'en-IN') {
    return 'Reply in crisp, helpful Indian English. Keep it concise (3-4 sentences max) and immediately actionable.';
  }
  return `Reply naturally in ${langObj.label} (${langObj.code}). Keep EV technical units (kWh, kW, km, ₹) easy to read, concise (3-4 sentences max), and immediately actionable.`;
}

function buildSystemPrompt(langObj, context) {
  const {
    role = 'driver',
    userName = 'EV User',
    soc = 24,
    batteryKwh = 4.0,
    safetyBufferPct = 20,
    usableSafeRangeKm = 21.9,
    grossRangeKm = 27.4,
    walletBalance = null,
    vehicleName = 'EV',
    nearestChargers = [],
    activeBooking = null
  } = context || {};

  const chargersText = nearestChargers.length
    ? nearestChargers
        .slice(0, 5)
        .map((c, idx) => {
          const price = c.billingType === 'time' ? `₹${c.timeRatePerHour}/hr` : `₹${c.pricePerKwh}/kWh`;
          return `${idx + 1}. ${c.name} (${c.code}) — ${c.estimatedRoadDistanceKm} km road dist, ${c.isReachable ? 'SAFE REACHABLE' : 'OUT OF SAFE RANGE'}, ${c.connectorType}, ${c.powerKw} kW, ${price}, status: ${c.status}`;
        })
        .join('\n')
    : 'No live chargers found in database.';

  const bookingText = activeBooking
    ? `Active booking: ${activeBooking.booking_code} at ${activeBooking.charger_name} on ${activeBooking.booking_date} (${activeBooking.start_time}-${activeBooking.end_time}), status: ${activeBooking.status}.`
    : 'No active booking currently.';

  return [
    'You are ChargeEase Saarthi, the official Indian EV charging co-pilot built with Sarvam AI for ChargeEase EV (India\'s reachability-first peer-to-peer EV charging network in Delhi NCR).',
    buildLanguageInstruction(langObj),
    'Always ground your recommendations strictly in the LIVE telemetry and charger data below. Do not invent fake charger names or prices.',
    'Highlight safety when battery is low (mention the 20% emergency reserve buffer). For host questions, remind them hosts retain 100% of their base tariff while drivers pay 10% platform fee + 18% GST separately.',
    '',
    'LIVE USER TELEMETRY:',
    `- User: ${userName} (Role: ${role})`,
    `- Vehicle: ${vehicleName} (${batteryKwh} kWh pack)`,
    `- Battery SoC: ${soc}% | Gross Range: ${grossRangeKm} km | Safety Buffer: ${safetyBufferPct}% | Usable Safe Reach: ${usableSafeRangeKm} km`,
    walletBalance !== null ? `- Wallet Balance: ₹${Number(walletBalance).toFixed(2)}` : '- Wallet Balance: Guest preview',
    `- ${bookingText}`,
    '',
    'LIVE NEARBY CHARGERS:',
    chargersText
  ].join('\n');
}

function buildSmartFallbackReply(message, langObj, context) {
  const {
    role = 'driver',
    soc = 24,
    safetyBufferPct = 20,
    usableSafeRangeKm = 21.9,
    nearestChargers = []
  } = context || {};

  const lower = String(message || '').toLowerCase();
  const safeAvailable = nearestChargers.filter((c) => c.isReachable && c.status === 'available');
  const best = safeAvailable[0] || nearestChargers[0] || null;
  const priceText = best
    ? (best.billingType === 'time' ? `₹${best.timeRatePerHour}/hr` : `₹${best.pricePerKwh}/kWh`)
    : '';

  const isHostQuery = role === 'host' || lower.includes('host') || lower.includes('earn') || lower.includes('payout') || lower.includes('kamai');
  const isBufferQuery = lower.includes('buffer') || lower.includes('safety') || lower.includes('20%');

  if (langObj.code === 'hi-IN') {
    if (isHostQuery) {
      return `होस्ट के रूप में आपको अपने बेस टैरिफ का 100% सीधा पेआउट मिलता है। पीक शाम (6 PM - 10 PM) में अपना चार्जर ऑनलाइन रखें और 7.4 kW Type 2 या 16A सॉकेट के लिए प्रतिस्पर्धी दर सेट करके ज्यादा बुकिंग पाएं।`;
    }
    if (isBufferQuery) {
      return `${safetyBufferPct}% सेफ्टी बफर आपकी बैटरी का आपातकालीन रिज़र्व सुरक्षित रखता है ताकि ट्रैफिक या डायवर्जन में आपकी EV रास्ते में न रुके। अभी ${soc}% बैटरी पर आपकी सुरक्षित पहुँच ${usableSafeRangeKm} km है।`;
    }
    if (best) {
      return `${soc}% बैटरी पर आपकी सुरक्षित रेंज ${usableSafeRangeKm} km है (${safetyBufferPct}% सेफ्टी बफर सहित)। आपके सबसे करीब सुरक्षित चार्जर "${best.name}" (${best.estimatedRoadDistanceKm} km, ${best.connectorType}, ${best.powerKw} kW, ${priceText}) अभी उपलब्ध है — नीचे से सीधे स्लॉट बुक करें।`;
    }
    return `${soc}% बैटरी पर आपकी सुरक्षित रेंज ${usableSafeRangeKm} km है। कृपया नज़दीकी चार्जर देखने के लिए लाइव GPS अपडेट करें।`;
  }

  if (langObj.code === 'hinglish') {
    if (isHostQuery) {
      return `Host ke roop mein aapko aapke base tariff ka 100% seedha payout milta hai (10% platform fee + GST driver alag se pay karta hai). Evening peak hours (6 PM - 10 PM) mein dock online rakhein aur atomic slot booking se steady earnings banayein!`;
    }
    if (isBufferQuery) {
      return `ChargeEase ka ${safetyBufferPct}% safety buffer aapki emergency reserve battery ko protect karta hai taaki traffic ya detour mein EV beech raaste mein na ruke. Abhi ${soc}% charge par aapki safe reach ${usableSafeRangeKm} km hai.`;
    }
    if (best) {
      return `${soc}% battery par aapki usable safe reach ${usableSafeRangeKm} km hai (${safetyBufferPct}% reserve buffer ke baad). Sabse best reachable dock "${best.name}" hai — sirf ${best.estimatedRoadDistanceKm} km door, ${best.connectorType} (${best.powerKw} kW) at ${priceText}. Neeche card se seedha slot lock kar sakte hain!`;
    }
    return `${soc}% battery par aapki safe reach ${usableSafeRangeKm} km hai. Map par live GPS refresh karke reachable chargers dekhein.`;
  }

  if (isHostQuery) {
    return `As a ChargeEase Host, you keep 100% of your base tariff (drivers pay the 10% platform fee + 18% GST separately). Keep your residential bay online during 6 PM – 10 PM evening peaks and publish clear gate access notes to maximize confirmed bookings.`;
  }
  if (isBufferQuery) {
    return `The ${safetyBufferPct}% safety reserve buffer holds back emergency range for urban detours and traffic so you never get stranded. At ${soc}% battery, your verified usable safe reach is ${usableSafeRangeKm} km.`;
  }
  if (best) {
    return `At ${soc}% charge, your usable safe reach is ${usableSafeRangeKm} km (after the ${safetyBufferPct}% safety buffer). Your best reachable dock is ${best.name} (${best.estimatedRoadDistanceKm} km road distance, ${best.connectorType}, ${best.powerKw} kW, ${priceText}). Tap below to focus on the map or lock a conflict-free slot.`;
  }
  return `At ${soc}% charge, your usable safe reach is ${usableSafeRangeKm} km. Refresh GPS or adjust your battery slider to scan nearby docks.`;
}

async function callSarvamChat(messages, model) {
  const apiKey = getApiKey();
  const res = await fetch(`${SARVAM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 280
    }),
    signal: AbortSignal.timeout(12000)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || data?.message || `Sarvam chat failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Empty response from Sarvam chat completions');
  }
  return { content: content.trim(), model: data?.model || model };
}

async function askSarvamCopilot({ message, language = 'hinglish', context = {} }) {
  const langObj = resolveLanguage(language);
  const cleanMessage = String(message || '').trim();
  const safeAvailable = (context.nearestChargers || []).filter((c) => c.isReachable && c.status === 'available');
  const recommendedStation = safeAvailable[0] || (context.nearestChargers || [])[0] || null;

  if (!isSarvamConfigured()) {
    return {
      reply: buildSmartFallbackReply(cleanMessage, langObj, context),
      language: langObj.code,
      languageLabel: langObj.label,
      mode: 'smart-fallback',
      model: 'local-reachability-fallback',
      recommendedStation
    };
  }

  const systemPrompt = buildSystemPrompt(langObj, context);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: cleanMessage }
  ];

  const primaryModel = String(process.env.SARVAM_CHAT_MODEL || 'sarvam-m').trim();
  const fallbackModels = ['sarvam-m', 'sarvam-105b'].filter((m) => m !== primaryModel);
  const modelsToTry = [primaryModel, ...fallbackModels];

  let lastErr = null;
  for (const model of modelsToTry) {
    try {
      const result = await callSarvamChat(messages, model);
      return {
        reply: result.content,
        language: langObj.code,
        languageLabel: langObj.label,
        mode: 'sarvam-live',
        model: result.model,
        recommendedStation
      };
    } catch (err) {
      lastErr = err;
      if (err.status === 401 || err.status === 403) break;
    }
  }

  console.error('[SARVAM CHAT FALLBACK]', lastErr?.message || 'Sarvam request failed');
  return {
    reply: buildSmartFallbackReply(cleanMessage, langObj, context),
    language: langObj.code,
    languageLabel: langObj.label,
    mode: 'smart-fallback',
    model: 'local-reachability-fallback',
    recommendedStation
  };
}

async function synthesizeSarvamSpeech({ text, language = 'hi-IN' }) {
  const langObj = resolveLanguage(language);
  const cleanText = String(text || '').replace(/[*#`_~]/g, '').trim().slice(0, 480);
  if (!cleanText) {
    return { success: false, fallbackToBrowserSpeech: true, reason: 'Text is required' };
  }

  if (!isSarvamConfigured()) {
    return {
      success: false,
      fallbackToBrowserSpeech: true,
      speechLocale: langObj.speechLocale,
      mode: 'browser-fallback',
      reason: 'SARVAM_API_KEY not configured'
    };
  }

  const apiKey = getApiKey();
  const ttsModel = String(process.env.SARVAM_TTS_MODEL || 'bulbul:v2').trim();
  const speaker = String(process.env.SARVAM_TTS_SPEAKER || langObj.speaker || 'anushka').trim();

  try {
    const res = await fetch(`${SARVAM_BASE_URL}/text-to-speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey
      },
      body: JSON.stringify({
        inputs: [cleanText],
        target_language_code: langObj.ttsCode,
        speaker,
        model: ttsModel,
        pace: 1.05,
        enable_preprocessing: true
      }),
      signal: AbortSignal.timeout(12000)
    });

    const data = await res.json().catch(() => ({}));
    const audioBase64 = Array.isArray(data?.audios) ? data.audios[0] : (data?.audio || null);

    if (!res.ok || !audioBase64) {
      throw new Error(data?.error?.message || data?.message || `Sarvam TTS failed (${res.status})`);
    }

    return {
      success: true,
      audioBase64,
      mimeType: 'audio/wav',
      model: ttsModel,
      speaker,
      language: langObj.ttsCode,
      mode: 'sarvam-bulbul-live',
      fallbackToBrowserSpeech: false
    };
  } catch (err) {
    console.error('[SARVAM TTS FALLBACK]', err?.message || 'Sarvam TTS error');
    return {
      success: false,
      fallbackToBrowserSpeech: true,
      speechLocale: langObj.speechLocale,
      mode: 'browser-fallback',
      reason: err?.message || 'Sarvam TTS unavailable'
    };
  }
}

async function translateWithSarvam({ text, targetLanguage = 'hi-IN', sourceLanguage = 'en-IN' }) {
  const cleanText = String(text || '').trim().slice(0, 900);
  const langObj = resolveLanguage(targetLanguage);

  if (!cleanText) {
    return { success: false, translatedText: '', mode: 'none', reason: 'Text is required' };
  }

  if (!isSarvamConfigured() || langObj.ttsCode === sourceLanguage) {
    return {
      success: true,
      translatedText: cleanText,
      targetLanguage: langObj.ttsCode,
      mode: isSarvamConfigured() ? 'passthrough' : 'unconfigured-passthrough'
    };
  }

  try {
    const res = await fetch(`${SARVAM_BASE_URL}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': getApiKey()
      },
      body: JSON.stringify({
        input: cleanText,
        source_language_code: sourceLanguage,
        target_language_code: langObj.ttsCode,
        model: 'mayura:v1',
        mode: 'formal',
        enable_preprocessing: true
      }),
      signal: AbortSignal.timeout(10000)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.translated_text) {
      throw new Error(data?.error?.message || data?.message || `Sarvam translate failed (${res.status})`);
    }

    return {
      success: true,
      translatedText: data.translated_text,
      targetLanguage: langObj.ttsCode,
      mode: 'sarvam-mayura-live'
    };
  } catch (err) {
    console.error('[SARVAM TRANSLATE FALLBACK]', err?.message || 'Sarvam translate error');
    return {
      success: true,
      translatedText: cleanText,
      targetLanguage: langObj.ttsCode,
      mode: 'fallback-original'
    };
  }
}

module.exports = {
  SUPPORTED_LANGUAGES,
  isSarvamConfigured,
  askSarvamCopilot,
  synthesizeSarvamSpeech,
  translateWithSarvam
};
