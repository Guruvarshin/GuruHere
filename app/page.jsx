"use client";
import { useEffect, useRef, useState } from "react";
import "./voicechat.css";

const micErrorMessage = (err) => {
  const code = (err?.error || err?.name || "").toLowerCase();
  if (code.includes("not-allowed")) {
    return "Microphone access was blocked. Please allow mic permission in your browser settings and try again.";
  }
  if (code.includes("service-not-allowed")) {
    return "Microphone permission is blocked for this site. Check the site settings and allow mic access.";
  }
  if (code.includes("audio-capture")) {
    return "No microphone detected or it’s in use by another app. Plug in a mic or close other apps using it.";
  }
  if (code.includes("no-speech")) {
    return "I didn’t catch anything—please speak closer to the mic and try again.";
  }
  if (code.includes("network")) {
    return "Speech service isn’t reachable right now. Check your internet connection.";
  }
  if (code.includes("security")) {
    return "Microphone requires a secure context. Use https or localhost (via `npm run dev`) instead of file://";
  }
  return err?.message || "Speech recognition error. Please try again.";
};

const getMicPermissionStatus = async () => {
  try {
    if (!("permissions" in navigator)) return null; 
    const status = await navigator.permissions.query({ name: "microphone" });
    return status.state; 
  } catch {
    return null;
  }
};

const hasWebSpeech = () => {
  return (
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) &&
    "speechSynthesis" in window
  );
};

export default function HomePage() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef(null);
  const runningRef = useRef(false);

  useEffect(() => {
    const hasWebSpeech =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition) &&
      "speechSynthesis" in window;

    if (!hasWebSpeech) {
      setSupported(false);
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SpeechRecognition();
    recog.lang = "en-US";
    recog.interimResults = true;
    recog.continuous = false;

    recog.onstart = () => {
      runningRef.current = true;
      setListening(true);
    };

    recog.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setTranscript(text.trim());
    };

    recog.onerror = (e) => {
      if (e?.error === "aborted") return; 
      setError(micErrorMessage(e));
    };

    const endAll = () => {
      runningRef.current = false;
      setListening(false);
    };
    recog.onend = endAll;
    recog.onabort = endAll;

    recognitionRef.current = recog;

    return () => {
      try { recog.abort(); } catch {}
      recognitionRef.current = null;
      runningRef.current = false;
    };
  }, []);

  const waitForEnd = () =>
    new Promise((resolve) => {
      const recog = recognitionRef.current;
      if (!recog || !runningRef.current) return resolve();
      const handleEnd = () => {
        recog.removeEventListener?.("end", handleEnd);
        resolve();
      };
      recog.addEventListener?.("end", handleEnd);
      try { recog.abort(); } catch { resolve(); }
    });

  const startListening = async () => {
    setError("");
    setAnswer("");
    setTranscript("");

    const recog = recognitionRef.current;
    if (!recog) return;

    if (runningRef.current) await waitForEnd();

    const micStatus = await getMicPermissionStatus();
    if (micStatus === "denied") {
      setError("Microphone is blocked. Click the mic icon in your browser’s address bar and allow access, then try again.");
      return;
    }

    try {
      window.speechSynthesis?.cancel();
      recog.start();
    } catch (e) {
      if (e?.name === "InvalidStateError") return;
      setError(micErrorMessage(e));
    }
  };

  const stopListening = () => {
    const recog = recognitionRef.current;
    if (!recog) return;
    try { recog.stop(); } catch {}
  };

  const speak = (text) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices?.() || [];
    const female = voices.find((v) =>
      /female|woman|Samantha|Google UK English Female|Microsoft Zira/i.test(v.name)
    );
    if (female) utter.voice = female;
    utter.pitch = 1.05;
    utter.rate = 1.0;

    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = (e) => {
      setSpeaking(false);
      if (String(e?.error || e?.name || "").toLowerCase().includes("not-allowed")) {
        setError("Audio playback was blocked. Tap once on the page to enable sound, then try ‘Answer’ again.");
      }
    };

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (e) {
      setSpeaking(false);
      setError("Couldn’t play audio. Make sure your device isn’t muted and try again.");
    }
  };

  const ask = async () => {
    const q = transcript.trim();
    if (!q) return;
    try {
      setLoading(true);
      setError("");
      setAnswer("");

      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q })
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const text = data?.answer || "";

      setAnswer(text);
      speak(text);
    } catch (e) {
      setError("Having trouble answering. Try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    "What should we know about your life story in a few sentences?",
    "What’s your #1 superpower?",
    "What are the top 3 areas you’d like to grow in?",
    "What misconception do your coworkers have about you?",
    "How do you push your boundaries and limits?",
  ];

  const youActive = listening;
  const guruActive = speaking;

  return (
    <main className="vc-shell">
      <div className="vc-header">
        <div className="vc-brand">
          <div className="vc-brandMark"><span style={{ fontWeight: 700 }}>GV</span></div>
          <div>
            <h1 className="vc-title">VoiceBot</h1>
            <div className="vc-statusRow">
              <span
                className={`vc-statusDot ${listening ? "vc-statusDot--on" : "vc-statusDot--off"}`}
              />
              <span className="vc-statusText">
                {supported ? (listening ? "Listening…" : "Ready") : "Web Speech not supported"}
              </span>
            </div>
          </div>
        </div>

        <div className="vc-controlsBar">
          {!listening ? (
            <button className="vc-iconBtn vc-micBtn" onClick={startListening} aria-label="Start">🎙️</button>
          ) : (
            <button className="vc-iconBtn vc-stopBtn" onClick={stopListening} aria-label="Stop">⏹️</button>
          )}

          <div className="vc-vuWrap">
            <div className="vc-vuGlow" style={{ opacity: listening ? 1 : 0 }} />
            <div className="vc-vuText">{listening ? "Listening…" : speaking ? "Speaking..." : "Idle"}</div>
          </div>

          <button
            className={`vc-cta ${loading || !transcript || speaking ? "vc-cta--disabled" : ""}`}
            style={{ opacity: listening ? 0.6 : speaking ? 0.6 : 1 }}
            onClick={ask}
            disabled={loading || !transcript || speaking}
          >
            {loading ? "Answering…" : "Answer"}
          </button>

        </div>
      </div>

      <div className="vc-bodyGrid vc-grid">
        {/* YOU / TRANSCRIPT */}
        <section className="vc-panel">
          {/* Large Profile Card */}
          <div className={`vc-profileCard ${youActive ? "vc-profileCard--active" : ""}`}>
            <img
              src={"/you.jpg"}
              alt="You"
              className="vc-profileImg"
            />
            <div className="vc-profileInfo">
              <div className="vc-profileName">You</div>
              <div className="vc-profileStatus">{youActive ? "Speaking…" : "Idle"}</div>
            </div>
          </div>

          {/* Caption under card */}
          <div className="vc-sectionCaption">Transcript</div>

          {/* Transcript bubble */}
          <p className="vc-bubbleUser">
            {transcript || <span style={{ color: "#94a3b8" }}>(Your speech will appear here)</span>}
          </p>

          <div className="vc-divider" />

          {/* Quick prompts */}
          <div>
            <strong className="vc-panelTitle">Try these</strong>
            <div className="vc-chipsWrap">
              {quickQuestions.map((q) => (
                <button key={q} className="vc-chip" onClick={() => setTranscript(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* GURU / ANSWER */}
        <section className="vc-panel">
          {/* Large Profile Card */}
          <div className={`vc-profileCard ${guruActive ? "vc-profileCard--guruActive" : ""}`}>
            <img
              src={"/guru.jpeg"}
              alt="Guru Varshini"
              className="vc-profileImg"
            />
            <div className="vc-profileInfo">
              <div className="vc-profileName">Guru Varshini</div>
              <div className={`vc-profileStatus ${guruActive ? "vc-profileStatus--speaking" : ""}`}>
                {guruActive ? "Speaking…" : "Ready"}
              </div>
            </div>
          </div>

          {/* Caption under card */}
          <div className="vc-sectionCaption">Answer</div>

          {/* Answer bubble */}
          <p className="vc-bubbleBot">
            {answer || <span style={{ color: "#94a3b8" }}>(The bot will speak and show the answer here)</span>}
          </p>

          {!supported && (
            <>
              <div className="vc-divider" />
              <p className="vc-fallbackText">
                Your browser doesn’t support Web Speech API. You can still type below and press <b>Answer</b>.
              </p>
              <textarea
                rows={4}
                className="vc-textarea"
                placeholder="Type your question here"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
              />
            </>
          )}
        </section>
      </div>

      {error && (
        <div className="vc-toast">
          <div className="vc-toastIcon">⚠️</div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Something went wrong</div>
            <div>{error}</div>
          </div>
          <button className="vc-toastClose" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
    </main>
  );
}
