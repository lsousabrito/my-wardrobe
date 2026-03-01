import { useState, useEffect, useRef, useCallback } from "react";

// ─── Storage Helpers ──────────────────────────────────────────────────────────
const storage = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ["All", "Top", "Bottom", "Shoes", "Accessory", "Outerwear"];
const OCCASIONS = ["Work/Office", "Casual", "Formal/Evening", "Gym/Sporty"];
const OCCASION_COLORS = {
  "Work/Office": "#6366f1",
  "Casual": "#10b981",
  "Formal/Evening": "#8b5cf6",
  "Gym/Sporty": "#f59e0b",
};
const NAV_ITEMS = [
  { id: "wardrobe", label: "Wardrobe", icon: "👔" },
  { id: "outfits", label: "Outfits", icon: "✨" },
  { id: "calendar", label: "Calendar", icon: "📅" },
  { id: "gaps", label: "Shop the Gap", icon: "🛍️" },
  { id: "packing", label: "Packing", icon: "🧳" },
  { id: "stats", label: "Stats", icon: "📊" },
];

// ─── Utility ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function fmtDate(d) { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

// ─── AI Helper ────────────────────────────────────────────────────────────────
async function callClaude(messages, systemPrompt = "") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.content.map(b => b.text || "").join("\n");
}

// ─── Components ───────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="relative w-full max-w-lg rounded-2xl shadow-2xl" style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Tag({ color, children }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: color + "22", color }}>
      {children}
    </span>
  );
}

// ─── Add Item Modal ────────────────────────────────────────────────────────────
function AddItemModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ name: "", category: "Top", colors: "", style: "", occasions: [], price: "" });
  const [photo, setPhoto] = useState(null);
  const [tab, setTab] = useState("upload"); // upload | webcam | barcode
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleOcc = (o) => set("occasions", form.occasions.includes(o) ? form.occasions.filter(x => x !== o) : [...form.occasions, o]);

  const startWebcam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch { alert("Camera access denied"); }
  };
  const stopWebcam = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
  const capturePhoto = () => {
    const v = videoRef.current;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    setPhoto(c.toDataURL("image/jpeg", 0.8));
    stopWebcam();
    setTab("upload");
  };

  useEffect(() => {
    if (tab === "webcam") startWebcam();
    else stopWebcam();
    return () => stopWebcam();
  }, [tab]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!form.name) return alert("Please enter a name");
    onSave({ ...form, id: uid(), photo, colors: form.colors.split(",").map(c => c.trim()).filter(Boolean), addedAt: Date.now(), wearCount: 0, lastWorn: null });
    setForm({ name: "", category: "Top", colors: "", style: "", occasions: [], price: "" });
    setPhoto(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Clothing Item">
      <div className="space-y-4">
        {/* Photo tabs */}
        <div className="flex gap-2 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
          {["upload", "webcam"].map(t => (
            <button key={t} onClick={() => setTab(t)} className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: tab === t ? "rgba(99,102,241,0.3)" : "transparent", color: tab === t ? "#818cf8" : "#9ca3af" }}>
              {t === "upload" ? "📁 Upload" : "📷 Webcam"}
            </button>
          ))}
        </div>

        {tab === "webcam" ? (
          <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <button onClick={capturePhoto} className="absolute bottom-3 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full text-white font-semibold text-sm"
              style={{ background: "rgba(99,102,241,0.9)" }}>Capture</button>
          </div>
        ) : (
          <div className="relative">
            {photo ? (
              <div className="relative">
                <img src={photo} alt="preview" className="w-full rounded-xl object-cover" style={{ maxHeight: 200 }} />
                <button onClick={() => setPhoto(null)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white text-sm flex items-center justify-center">&times;</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed cursor-pointer py-8 gap-2"
                style={{ borderColor: "rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.05)" }}>
                <span className="text-3xl">🖼️</span>
                <span className="text-sm text-gray-400">Click to upload photo</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            )}
          </div>
        )}

        <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Item name *"
          className="w-full px-4 py-2.5 rounded-xl text-white text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }} />

        <div className="grid grid-cols-2 gap-3">
          <select value={form.category} onChange={e => set("category", e.target.value)}
            className="px-4 py-2.5 rounded-xl text-white text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
            {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.style} onChange={e => set("style", e.target.value)} placeholder="Style tag (e.g. Oxford)"
            className="px-4 py-2.5 rounded-xl text-white text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }} />
        </div>

        <input value={form.colors} onChange={e => set("colors", e.target.value)} placeholder="Colors (comma-separated, e.g. Navy, White)"
          className="w-full px-4 py-2.5 rounded-xl text-white text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }} />

        <input value={form.price} onChange={e => set("price", e.target.value)} placeholder="Price (optional, for cost-per-wear)"
          type="number" className="w-full px-4 py-2.5 rounded-xl text-white text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }} />

        <div>
          <p className="text-xs text-gray-400 mb-2">Occasions</p>
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map(o => (
              <button key={o} onClick={() => toggleOcc(o)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background: form.occasions.includes(o) ? OCCASION_COLORS[o] + "33" : "rgba(255,255,255,0.07)",
                  color: form.occasions.includes(o) ? OCCASION_COLORS[o] : "#9ca3af",
                  border: `1px solid ${form.occasions.includes(o) ? OCCASION_COLORS[o] : "transparent"}`,
                }}>
                {o}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleSave} className="w-full py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
          Add to Wardrobe
        </button>
      </div>
    </Modal>
  );
}

// ─── Clothing Card ─────────────────────────────────────────────────────────────
function ClothingCard({ item, onDelete, onSelect, selected }) {
  return (
    <div onClick={() => onSelect?.(item)} className="relative rounded-2xl overflow-hidden cursor-pointer group transition-all duration-200 hover:scale-105"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `2px solid ${selected ? "#6366f1" : "rgba(255,255,255,0.08)"}`,
        boxShadow: selected ? "0 0 20px rgba(99,102,241,0.3)" : "0 4px 24px rgba(0,0,0,0.3)",
      }}>
      <div className="relative" style={{ aspectRatio: "3/4" }}>
        {item.photo ? (
          <img src={item.photo} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: "rgba(99,102,241,0.1)" }}>
            {item.category === "Top" ? "👕" : item.category === "Bottom" ? "👖" : item.category === "Shoes" ? "👟" : item.category === "Outerwear" ? "🧥" : "💍"}
          </div>
        )}
        {onDelete && (
          <button onClick={e => { e.stopPropagation(); onDelete(item.id); }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            ✕
          </button>
        )}
        {item.lastWorn && Date.now() - item.lastWorn < 7 * 86400000 && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "rgba(245,158,11,0.9)", color: "#000" }}>
            Recent
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-white text-sm font-semibold truncate">{item.name}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs" style={{ color: "#6366f1" }}>{item.category}</span>
          <span className="text-xs text-gray-500">×{item.wearCount || 0}</span>
        </div>
        {item.colors?.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {item.colors.slice(0, 3).map((c, i) => <Tag key={i} color="#9ca3af">{c}</Tag>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Wardrobe Tab ─────────────────────────────────────────────────────────────
function WardrobeTab({ wardrobe, setWardrobe }) {
  const [showAdd, setShowAdd] = useState(false);
  const [catFilter, setCatFilter] = useState("All");
  const [occFilter, setOccFilter] = useState("All");

  const filtered = wardrobe.filter(item => {
    if (catFilter !== "All" && item.category !== catFilter) return false;
    if (occFilter !== "All" && !item.occasions?.includes(occFilter)) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">My Wardrobe</h2>
          <p className="text-gray-400 text-sm mt-1">{wardrobe.length} items</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
          + Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{ background: catFilter === c ? "#6366f1" : "rgba(255,255,255,0.07)", color: catFilter === c ? "#fff" : "#9ca3af" }}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...OCCASIONS].map(o => (
            <button key={o} onClick={() => setOccFilter(o)} className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: occFilter === o ? (OCCASION_COLORS[o] || "#6366f1") : "rgba(255,255,255,0.07)",
                color: occFilter === o ? "#fff" : "#9ca3af",
              }}>
              {o}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="text-6xl mb-4">👗</span>
          <p className="text-gray-400">No items yet. Add your first clothing item!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(item => (
            <ClothingCard key={item.id} item={item} onDelete={(id) => setWardrobe(w => w.filter(i => i.id !== id))} />
          ))}
        </div>
      )}

      <AddItemModal open={showAdd} onClose={() => setShowAdd(false)} onSave={(item) => setWardrobe(w => [item, ...w])} />
    </div>
  );
}

// ─── Outfit Suggestion Tab ────────────────────────────────────────────────────
function OutfitsTab({ wardrobe, setWardrobe, outfitHistory, setOutfitHistory }) {
  const [occasion, setOccasion] = useState("Casual");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [manualItems, setManualItems] = useState([]);

  const recentlyWorn = new Set(
    outfitHistory
      .filter(o => Date.now() - o.date < 7 * 86400000)
      .flatMap(o => o.items)
  );

  const suggestOutfit = async () => {
    setLoading(true); setError(null); setSuggestion(null);
    try {
      const wardrobeDesc = wardrobe.map(item => ({
        id: item.id, name: item.name, category: item.category,
        colors: item.colors, style: item.style, occasions: item.occasions,
        recentlyWorn: recentlyWorn.has(item.id),
      }));
      const recentOutfits = outfitHistory.slice(0, 5).map(o => ({ date: fmtDate(o.date), occasion: o.occasion, items: o.items.map(id => wardrobe.find(w => w.id === id)?.name).filter(Boolean) }));

      const prompt = `You are a personal stylist AI. The user wants an outfit for: ${occasion}.

Wardrobe items:
${JSON.stringify(wardrobeDesc, null, 2)}

Recent outfit history (avoid re-suggesting items worn in last 7 days marked as recentlyWorn:true):
${JSON.stringify(recentOutfits, null, 2)}

Suggest a complete outfit. Respond in this exact JSON format:
{
  "items": ["item_id1", "item_id2", "item_id3"],
  "explanation": "Brief explanation of color coordination and occasion fit",
  "colorLogic": "How the colors work together",
  "styleNotes": "Additional styling tips"
}

Only include item IDs from the wardrobe. Prioritize items NOT recently worn. Ensure the outfit is appropriate for ${occasion}.`;

      const result = await callClaude([{ role: "user", content: prompt }], "You are a fashion-forward personal stylist. Always respond with valid JSON only.");
      const clean = result.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      parsed.suggestedItems = parsed.items.map(id => wardrobe.find(w => w.id === id)).filter(Boolean);
      setSuggestion({ ...parsed, occasion });
    } catch (e) {
      setError("Failed to get suggestion: " + e.message);
    }
    setLoading(false);
  };

  const confirmOutfit = (items, occ) => {
    const entry = { id: uid(), date: Date.now(), occasion: occ, items: items.map(i => i.id), note: "" };
    setOutfitHistory(h => [entry, ...h]);
    setWardrobe(w => w.map(item => items.find(i => i.id === item.id) ? { ...item, wearCount: (item.wearCount || 0) + 1, lastWorn: Date.now() } : item));
    setSuggestion(null);
    alert("Outfit logged! ✨");
  };

  const confirmManual = () => {
    if (manualItems.length === 0) return;
    confirmOutfit(manualItems, occasion);
    setManualItems([]); setShowManual(false);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-1">AI Outfit Suggestions</h2>
        <p className="text-gray-400 text-sm">Let Claude style your perfect outfit</p>
      </div>

      <div className="rounded-2xl p-6 mb-6" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
        <p className="text-sm font-medium text-gray-300 mb-3">Select Occasion</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {OCCASIONS.map(o => (
            <button key={o} onClick={() => setOccasion(o)}
              className="py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: occasion === o ? OCCASION_COLORS[o] + "33" : "rgba(255,255,255,0.05)",
                color: occasion === o ? OCCASION_COLORS[o] : "#9ca3af",
                border: `1px solid ${occasion === o ? OCCASION_COLORS[o] : "transparent"}`,
              }}>
              {o}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={suggestOutfit} disabled={loading || wardrobe.length < 2}
            className="flex-1 py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            {loading ? <><span className="animate-spin">⟳</span> Styling...</> : "✨ Suggest Outfit"}
          </button>
          <button onClick={() => setShowManual(!showManual)} className="px-4 py-3 rounded-xl text-sm font-medium transition-all"
            style={{ background: "rgba(255,255,255,0.07)", color: "#9ca3af" }}>
            Log Manual
          </button>
        </div>
        {wardrobe.length < 2 && <p className="text-xs text-yellow-500 mt-2">Add at least 2 items to your wardrobe first</p>}
      </div>

      {error && <div className="p-4 rounded-xl mb-4 text-red-400 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</div>}

      {suggestion && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="p-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">Your {suggestion.occasion} Outfit</h3>
              <Tag color={OCCASION_COLORS[suggestion.occasion] || "#6366f1"}>{suggestion.occasion}</Tag>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-5">
              {suggestion.suggestedItems.map(item => <ClothingCard key={item.id} item={item} />)}
            </div>
            <div className="space-y-3">
              <div className="p-4 rounded-xl" style={{ background: "rgba(99,102,241,0.1)" }}>
                <p className="text-xs font-medium text-indigo-400 mb-1">✨ Style Explanation</p>
                <p className="text-sm text-gray-300">{suggestion.explanation}</p>
              </div>
              {suggestion.colorLogic && (
                <div className="p-4 rounded-xl" style={{ background: "rgba(16,185,129,0.1)" }}>
                  <p className="text-xs font-medium text-emerald-400 mb-1">🎨 Color Logic</p>
                  <p className="text-sm text-gray-300">{suggestion.colorLogic}</p>
                </div>
              )}
              {suggestion.styleNotes && (
                <div className="p-4 rounded-xl" style={{ background: "rgba(139,92,246,0.1)" }}>
                  <p className="text-xs font-medium text-purple-400 mb-1">💡 Style Notes</p>
                  <p className="text-sm text-gray-300">{suggestion.styleNotes}</p>
                </div>
              )}
            </div>
            <button onClick={() => confirmOutfit(suggestion.suggestedItems, suggestion.occasion)}
              className="w-full mt-4 py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
              ✓ Wear This Outfit Today
            </button>
          </div>
        </div>
      )}

      {showManual && (
        <div className="rounded-2xl p-5 mt-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <h3 className="text-white font-semibold mb-3">Log Manual Outfit</h3>
          <p className="text-xs text-gray-400 mb-3">Select items you wore today:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto mb-4">
            {wardrobe.map(item => (
              <ClothingCard key={item.id} item={item} selected={manualItems.find(i => i.id === item.id)}
                onSelect={(item) => setManualItems(prev => prev.find(i => i.id === item.id) ? prev.filter(i => i.id !== item.id) : [...prev, item])} />
            ))}
          </div>
          <button onClick={confirmManual} disabled={manualItems.length === 0}
            className="w-full py-2.5 rounded-xl text-white font-semibold disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            Log {manualItems.length} Items as Today's Outfit
          </button>
        </div>
      )}

      {/* Recent outfit history */}
      {outfitHistory.length > 0 && (
        <div className="mt-8">
          <h3 className="text-white font-semibold mb-4">Recent Outfits</h3>
          <div className="space-y-3">
            {outfitHistory.slice(0, 5).map(entry => (
              <div key={entry.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex -space-x-3">
                  {entry.items.slice(0, 3).map(id => {
                    const item = wardrobe.find(w => w.id === id);
                    return item?.photo ? (
                      <img key={id} src={item.photo} alt="" className="w-10 h-10 rounded-full object-cover border-2" style={{ borderColor: "#1a1a2e" }} />
                    ) : (
                      <div key={id} className="w-10 h-10 rounded-full flex items-center justify-center text-lg border-2" style={{ background: "rgba(99,102,241,0.2)", borderColor: "#1a1a2e" }}>
                        {item?.category === "Top" ? "👕" : item?.category === "Bottom" ? "👖" : "👟"}
                      </div>
                    );
                  })}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{fmtDate(entry.date)}</p>
                  <p className="text-xs text-gray-400">{entry.items.length} items · {entry.occasion}</p>
                </div>
                <Tag color={OCCASION_COLORS[entry.occasion] || "#6366f1"}>{entry.occasion}</Tag>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function CalendarTab({ wardrobe, outfitHistory }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const getOutfitForDay = (day) => {
    const d = new Date(year, month, day);
    const start = d.setHours(0, 0, 0, 0);
    const end = new Date(year, month, day, 23, 59, 59, 999).getTime();
    return outfitHistory.find(o => o.date >= start && o.date <= end);
  };

  const selectedOutfit = selectedDay ? getOutfitForDay(selectedDay) : null;
  const selectedItems = selectedOutfit?.items.map(id => wardrobe.find(w => w.id === id)).filter(Boolean) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Outfit Calendar</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentDate(new Date(year, month - 1))} className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-white/10 text-gray-400">‹</button>
          <span className="text-white font-semibold min-w-[120px] text-center">
            {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => setCurrentDate(new Date(year, month + 1))} className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-white/10 text-gray-400">›</button>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="grid grid-cols-7 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="py-3 text-center text-xs font-semibold text-gray-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_, i) => <div key={"e" + i} className="p-2 min-h-16" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", borderRight: "1px solid rgba(255,255,255,0.04)" }} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const outfit = getOutfitForDay(day);
            const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
            const isSelected = selectedDay === day;
            const firstItem = outfit?.items[0] ? wardrobe.find(w => w.id === outfit.items[0]) : null;

            return (
              <div key={day} onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                className="p-2 min-h-16 cursor-pointer transition-all"
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  borderRight: "1px solid rgba(255,255,255,0.04)",
                  background: isSelected ? "rgba(99,102,241,0.15)" : "transparent",
                }}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1 ${isToday ? "text-white" : "text-gray-400"}`}
                  style={{ background: isToday ? "#6366f1" : "transparent" }}>
                  {day}
                </div>
                {firstItem?.photo && (
                  <img src={firstItem.photo} alt="" className="w-full rounded object-cover" style={{ height: 40 }} />
                )}
                {outfit && !firstItem?.photo && (
                  <div className="w-full rounded flex items-center justify-center text-base" style={{ height: 40, background: "rgba(99,102,241,0.2)" }}>
                    {outfit.items.length}🧥
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedOutfit && selectedItems.length > 0 && (
        <div className="mt-4 rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">{new Date(year, month, selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h3>
            <Tag color={OCCASION_COLORS[selectedOutfit.occasion] || "#6366f1"}>{selectedOutfit.occasion}</Tag>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {selectedItems.map(item => <ClothingCard key={item.id} item={item} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gap Analysis Tab ─────────────────────────────────────────────────────────
function GapsTab({ wardrobe }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const analyzeGaps = async () => {
    setLoading(true); setError(null);
    try {
      const summary = CATEGORIES.slice(1).map(cat => ({
        category: cat,
        count: wardrobe.filter(i => i.category === cat).length,
        occasions: OCCASIONS.map(o => ({ occasion: o, count: wardrobe.filter(i => i.category === cat && i.occasions?.includes(o)).length })),
      }));

      const prompt = `Analyze this wardrobe and identify gaps. Return JSON only:
{
  "gaps": [
    {
      "category": "category name",
      "occasion": "occasion name",
      "severity": "high|medium|low",
      "suggestion": "specific item suggestion",
      "reason": "why this is needed"
    }
  ],
  "overallAssessment": "brief overall assessment",
  "topPriority": "the single most important gap to fill"
}

Wardrobe summary:
${JSON.stringify(summary, null, 2)}

Identify missing essentials, underrepresented categories per occasion, and specific items that would complete the wardrobe.`;

      const result = await callClaude([{ role: "user", content: prompt }], "You are a professional wardrobe consultant. Always respond with valid JSON only.");
      const clean = result.replace(/```json|```/g, "").trim();
      setAnalysis(JSON.parse(clean));
    } catch (e) {
      setError("Analysis failed: " + e.message);
    }
    setLoading(false);
  };

  const severityColor = { high: "#ef4444", medium: "#f59e0b", low: "#10b981" };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">Shop the Gap</h2>
        <p className="text-gray-400 text-sm">AI-powered wardrobe gap analysis</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {CATEGORIES.slice(1).map(cat => (
          <div key={cat} className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-2xl font-bold text-white">{wardrobe.filter(i => i.category === cat).length}</p>
            <p className="text-xs text-gray-400 mt-1">{cat}s</p>
          </div>
        ))}
      </div>

      <button onClick={analyzeGaps} disabled={loading || wardrobe.length < 3}
        className="w-full py-3 rounded-xl text-white font-semibold mb-6 transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
        {loading ? <><span className="animate-spin">⟳</span> Analyzing...</> : "🔍 Analyze My Wardrobe Gaps"}
      </button>

      {error && <div className="p-4 rounded-xl text-red-400 text-sm mb-4" style={{ background: "rgba(239,68,68,0.1)" }}>{error}</div>}

      {analysis && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
            <p className="text-xs font-medium text-indigo-400 mb-1">Overall Assessment</p>
            <p className="text-sm text-gray-300">{analysis.overallAssessment}</p>
            {analysis.topPriority && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: "rgba(99,102,241,0.2)" }}>
                <p className="text-xs text-indigo-300">🎯 Top Priority: <span className="text-white">{analysis.topPriority}</span></p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {analysis.gaps?.map((gap, i) => (
              <div key={i} className="p-4 rounded-xl flex gap-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="w-2 flex-shrink-0 rounded-full" style={{ background: severityColor[gap.severity] || "#6366f1" }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-sm font-semibold">{gap.suggestion}</span>
                    <Tag color={severityColor[gap.severity] || "#6366f1"}>{gap.severity}</Tag>
                  </div>
                  <p className="text-xs text-gray-400">{gap.category} for {gap.occasion}</p>
                  <p className="text-xs text-gray-500 mt-1">{gap.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Packing Tab ──────────────────────────────────────────────────────────────
function PackingTab({ wardrobe }) {
  const [form, setForm] = useState({ destination: "", days: "7", occasions: [] });
  const [loading, setLoading] = useState(false);
  const [packingList, setPackingList] = useState(null);
  const [error, setError] = useState(null);

  const toggleOcc = (o) => setForm(f => ({ ...f, occasions: f.occasions.includes(o) ? f.occasions.filter(x => x !== o) : [...f.occasions, o] }));

  const generateList = async () => {
    if (!form.destination || !form.days) return alert("Fill in destination and duration");
    setLoading(true); setError(null);
    try {
      const wardrobeDesc = wardrobe.map(i => ({ id: i.id, name: i.name, category: i.category, occasions: i.occasions, colors: i.colors, style: i.style }));
      const prompt = `Generate a smart packing list for a ${form.days}-day trip to ${form.destination} with occasions: ${form.occasions.join(", ") || "mixed"}.

Available wardrobe:
${JSON.stringify(wardrobeDesc, null, 2)}

Return JSON only:
{
  "packingList": [
    {
      "itemId": "id from wardrobe (or null for new purchase)",
      "itemName": "name",
      "category": "category",
      "quantity": 1,
      "reason": "why include",
      "isFromWardrobe": true
    }
  ],
  "shoppingNeeds": ["list of items to buy that aren't in wardrobe"],
  "packingTips": ["3-5 tips for this destination"],
  "totalItems": 12
}`;

      const result = await callClaude([{ role: "user", content: prompt }], "You are a travel packing expert. Always respond with valid JSON only.");
      const clean = result.replace(/```json|```/g, "").trim();
      setPackingList(JSON.parse(clean));
    } catch (e) {
      setError("Failed: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">Packing List Builder</h2>
        <p className="text-gray-400 text-sm">Smart packing from your actual wardrobe</p>
      </div>

      <div className="rounded-2xl p-5 mb-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="Destination (e.g. Paris, France)"
            className="col-span-2 px-4 py-2.5 rounded-xl text-white text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }} />
          <input value={form.days} onChange={e => setForm(f => ({ ...f, days: e.target.value }))} placeholder="Duration (days)" type="number" min="1"
            className="px-4 py-2.5 rounded-xl text-white text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }} />
        </div>
        <p className="text-xs text-gray-400 mb-2">Occasion Mix</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {OCCASIONS.map(o => (
            <button key={o} onClick={() => toggleOcc(o)} className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{ background: form.occasions.includes(o) ? OCCASION_COLORS[o] + "33" : "rgba(255,255,255,0.07)", color: form.occasions.includes(o) ? OCCASION_COLORS[o] : "#9ca3af", border: `1px solid ${form.occasions.includes(o) ? OCCASION_COLORS[o] : "transparent"}` }}>
              {o}
            </button>
          ))}
        </div>
        <button onClick={generateList} disabled={loading || wardrobe.length < 3}
          className="w-full py-3 rounded-xl text-white font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
          {loading ? <><span className="animate-spin">⟳</span> Generating...</> : "🧳 Generate Packing List"}
        </button>
      </div>

      {error && <div className="p-4 rounded-xl text-red-400 text-sm mb-4" style={{ background: "rgba(239,68,68,0.1)" }}>{error}</div>}

      {packingList && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Your Packing List</h3>
            <span className="text-sm text-gray-400">{packingList.totalItems || packingList.packingList?.length} items</span>
          </div>

          <div className="space-y-2">
            {packingList.packingList?.map((item, i) => {
              const wardrobeItem = wardrobe.find(w => w.id === item.itemId);
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {wardrobeItem?.photo ? (
                    <img src={wardrobeItem.photo} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg" style={{ background: item.isFromWardrobe ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.2)" }}>
                      {item.category === "Top" ? "👕" : item.category === "Bottom" ? "👖" : item.category === "Shoes" ? "👟" : "🧳"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.itemName}</p>
                    <p className="text-xs text-gray-500">{item.reason}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.quantity > 1 && <span className="text-xs text-gray-400">×{item.quantity}</span>}
                    <Tag color={item.isFromWardrobe ? "#10b981" : "#f59e0b"}>{item.isFromWardrobe ? "✓ Owned" : "Buy"}</Tag>
                  </div>
                </div>
              );
            })}
          </div>

          {packingList.shoppingNeeds?.length > 0 && (
            <div className="p-4 rounded-xl" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <p className="text-xs font-medium text-yellow-400 mb-2">🛍️ Shopping Needed</p>
              <ul className="space-y-1">
                {packingList.shoppingNeeds.map((item, i) => <li key={i} className="text-sm text-gray-300">• {item}</li>)}
              </ul>
            </div>
          )}

          {packingList.packingTips?.length > 0 && (
            <div className="p-4 rounded-xl" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <p className="text-xs font-medium text-indigo-400 mb-2">💡 Packing Tips</p>
              <ul className="space-y-1">
                {packingList.packingTips.map((tip, i) => <li key={i} className="text-sm text-gray-300">• {tip}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────
function StatsTab({ wardrobe, outfitHistory }) {
  const sorted = [...wardrobe].sort((a, b) => (b.wearCount || 0) - (a.wearCount || 0));
  const mostWorn = sorted.slice(0, 5);
  const leastWorn = [...wardrobe].sort((a, b) => (a.wearCount || 0) - (b.wearCount || 0)).slice(0, 5);
  const occFreq = OCCASIONS.map(o => ({ occasion: o, count: outfitHistory.filter(h => h.occasion === o).length }));
  const totalOutfits = outfitHistory.length;
  const totalItems = wardrobe.length;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">Stats Dashboard</h2>
        <p className="text-gray-400 text-sm">Your wardrobe insights</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Items", value: totalItems, icon: "👗" },
          { label: "Outfits Logged", value: totalOutfits, icon: "📝" },
          { label: "Items Worn", value: wardrobe.filter(i => i.wearCount > 0).length, icon: "✅" },
          { label: "Never Worn", value: wardrobe.filter(i => !i.wearCount).length, icon: "💤" },
        ].map(stat => (
          <div key={stat.label} className="p-4 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-xs text-gray-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h3 className="text-sm font-semibold text-white mb-3">Outfits by Occasion</h3>
          <div className="space-y-2">
            {occFreq.map(({ occasion, count }) => (
              <div key={occasion}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300">{occasion}</span>
                  <span className="text-gray-400">{count}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: totalOutfits ? `${(count / totalOutfits) * 100}%` : "0%", background: OCCASION_COLORS[occasion] }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h3 className="text-sm font-semibold text-white mb-3">Category Breakdown</h3>
          <div className="space-y-2">
            {CATEGORIES.slice(1).map(cat => {
              const count = wardrobe.filter(i => i.category === cat).length;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300">{cat}</span>
                    <span className="text-gray-400">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-full rounded-full" style={{ width: totalItems ? `${(count / totalItems) * 100}%` : "0%", background: "#6366f1" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h3 className="text-sm font-semibold text-white mb-3">🏆 Most Worn</h3>
          <div className="space-y-2">
            {mostWorn.map((item, i) => (
              <div key={item.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                {item.photo ? <img src={item.photo} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-lg bg-indigo-900/40 flex items-center justify-center text-sm">👕</div>}
                <span className="text-sm text-gray-300 flex-1 truncate">{item.name}</span>
                <span className="text-xs font-semibold text-indigo-400">×{item.wearCount || 0}</span>
                {item.price && <span className="text-xs text-gray-500">${(item.price / Math.max(item.wearCount, 1)).toFixed(0)}/wear</span>}
              </div>
            ))}
            {mostWorn.length === 0 && <p className="text-sm text-gray-500">No wear data yet</p>}
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h3 className="text-sm font-semibold text-white mb-3">😴 Neglected Items</h3>
          <div className="space-y-2">
            {leastWorn.map((item, i) => (
              <div key={item.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                {item.photo ? <img src={item.photo} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-lg bg-indigo-900/40 flex items-center justify-center text-sm">👕</div>}
                <span className="text-sm text-gray-300 flex-1 truncate">{item.name}</span>
                <span className="text-xs text-gray-500">×{item.wearCount || 0}</span>
              </div>
            ))}
            {leastWorn.length === 0 && <p className="text-sm text-gray-500">Add items to track wear</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [wardrobe, setWardrobe] = useState(() => storage.get("wardrobe", []));
  const [outfitHistory, setOutfitHistory] = useState(() => storage.get("outfitHistory", []));
  const [activeTab, setActiveTab] = useState("wardrobe");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { storage.set("wardrobe", wardrobe); }, [wardrobe]);
  useEffect(() => { storage.set("outfitHistory", outfitHistory); }, [outfitHistory]);

  const renderTab = () => {
    switch (activeTab) {
      case "wardrobe": return <WardrobeTab wardrobe={wardrobe} setWardrobe={setWardrobe} />;
      case "outfits": return <OutfitsTab wardrobe={wardrobe} setWardrobe={setWardrobe} outfitHistory={outfitHistory} setOutfitHistory={setOutfitHistory} />;
      case "calendar": return <CalendarTab wardrobe={wardrobe} outfitHistory={outfitHistory} />;
      case "gaps": return <GapsTab wardrobe={wardrobe} />;
      case "packing": return <PackingTab wardrobe={wardrobe} />;
      case "stats": return <StatsTab wardrobe={wardrobe} outfitHistory={outfitHistory} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#0f0f1a", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 flex-col transition-transform duration-300 lg:static lg:flex ${sidebarOpen ? "flex translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ background: "#13132a", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Logo */}
        <div className="px-6 py-8 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              ✦
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Atelier</h1>
              <p className="text-xs" style={{ color: "#6366f1" }}>Smart Wardrobe</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-6 px-3">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all text-left"
              style={{
                background: activeTab === item.id ? "rgba(99,102,241,0.2)" : "transparent",
                color: activeTab === item.id ? "#818cf8" : "#6b7280",
              }}>
              <span className="text-lg w-6 text-center">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
              {activeTab === item.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "rgba(99,102,241,0.3)" }}>
              AI
            </div>
            <div>
              <p className="text-xs font-medium text-white">Powered by Claude</p>
              <p className="text-xs text-gray-600">claude-sonnet-4-6</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Sidebar overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="flex items-center justify-between px-5 py-4 lg:hidden sticky top-0 z-20"
          style={{ background: "#0f0f1a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-xl">☰</button>
          <span className="text-white font-bold text-sm">✦ Atelier</span>
          <div className="w-8" />
        </header>

        <div className="flex-1 overflow-y-auto p-5 lg:p-8 max-w-6xl mx-auto w-full">
          {renderTab()}
        </div>
      </main>
    </div>
  );
}
