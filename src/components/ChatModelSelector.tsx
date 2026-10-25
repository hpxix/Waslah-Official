import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Lock, Zap } from "lucide-react";
import "./chat-model-selector.css";

export type WaslaModelChoice = "b2c" | "b2b" | "ultra";
type ReasoningMode = "fast" | "high";

const models: WaslaModelChoice[] = ["b2c", "b2b", "ultra"];
const names: Record<WaslaModelChoice, string> = {
  b2c: "Wasla Lite",
  b2b: "Wasla Astraeus",
  ultra: "Wasla Astraeus Ultra",
};
const clamp = (value: number) => Math.max(0, Math.min(2, value));

export function ChatModelSelector({
  language,
  model,
  availableModels,
  reasoningMode,
  onModelChange,
  onReasoningModeChange,
}: {
  language: string;
  model: WaslaModelChoice | null;
  availableModels: Record<WaslaModelChoice, boolean>;
  reasoningMode: ReasoningMode;
  onModelChange: (model: WaslaModelChoice) => void;
  onReasoningModeChange: (mode: ReasoningMode) => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const spring = useRef({ x: models.indexOf(model ?? "b2c"), velocity: 0, target: models.indexOf(model ?? "b2c"), lastTime: 0 });
  const drag = useRef<{ pointerId: number; lastX: number; lastTime: number; velocity: number } | null>(null);
  const previousModel = useRef<WaslaModelChoice | null>(model);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visualPosition, setVisualPosition] = useState(models.indexOf(model ?? "b2c"));
  const [flash, setFlash] = useState<{ model: WaslaModelChoice; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  const ar = language === "ar";
  const selectedModel = model ?? "b2c";
  const selectedName = model ? names[model] : "Wasla AI";

  const stopAnimation = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const settleTo = useCallback((target: number) => {
    spring.current.target = target;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stopAnimation();
      spring.current.x = target;
      spring.current.velocity = 0;
      setVisualPosition(target);
      return;
    }
    if (frame.current !== null || drag.current) return;
    const tick = (time: number) => {
      const s = spring.current;
      const dt = Math.min((time - (s.lastTime || time)) / 1000, 0.032);
      s.lastTime = time;
      s.velocity += ((s.target - s.x) * 380 - s.velocity * 35) * dt;
      s.x = clamp(s.x + s.velocity * dt);
      setVisualPosition(s.x);
      if (Math.abs(s.target - s.x) < 0.002 && Math.abs(s.velocity) < 0.02) {
        s.x = s.target;
        s.velocity = 0;
        s.lastTime = 0;
        setVisualPosition(s.target);
        frame.current = null;
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    spring.current.lastTime = 0;
    frame.current = requestAnimationFrame(tick);
  }, [stopAnimation]);

  useEffect(() => {
    settleTo(models.indexOf(selectedModel));
    if (previousModel.current !== null && previousModel.current !== model && model) {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      setFlash({ model, key: Date.now() });
      flashTimeout.current = setTimeout(() => setFlash(null), 850);
    }
    previousModel.current = model;
  }, [model, selectedModel, settleTo]);

  useEffect(() => () => {
    stopAnimation();
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
  }, [stopAnimation]);

  const positionPanel = useCallback(() => {
    if (!panel.current || !trigger.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const popupWidth = panel.current.offsetWidth;
    const popupHeight = panel.current.offsetHeight;
    const alignedLeft = ar ? anchor.left : anchor.right - popupWidth;
    const left = Math.max(12, Math.min(alignedLeft, window.innerWidth - popupWidth - 12));
    const above = anchor.top - popupHeight - 10;
    const top = above >= 12 ? above : Math.min(anchor.bottom + 10, window.innerHeight - popupHeight - 12);
    panel.current.style.left = `${left}px`;
    panel.current.style.top = `${Math.max(12, top)}px`;
    panel.current.style.transformOrigin = `${Math.max(0, Math.min(100, ((anchor.left + anchor.width / 2 - left) / popupWidth) * 100))}% ${above >= 12 ? "100%" : "0%"}`;
  }, [ar]);

  useLayoutEffect(() => {
    if (!open) return;
    positionPanel();
    const observer = new ResizeObserver(positionPanel);
    if (trigger.current) observer.observe(trigger.current);
    if (trigger.current?.closest(".ops-chat-composer")) observer.observe(trigger.current.closest(".ops-chat-composer")!);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open, positionPanel]);

  const positionAt = (clientX: number) => {
    const bounds = rail.current?.getBoundingClientRect();
    if (!bounds) return 0;
    const inset = 8;
    return clamp(((clientX - bounds.left - inset) / Math.max(1, bounds.width - inset * 2)) * 2);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!models.some((choice) => availableModels[choice])) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    stopAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = positionAt(event.clientX);
    drag.current = { pointerId: event.pointerId, lastX: x, lastTime: event.timeStamp, velocity: 0 };
    spring.current.x = x;
    spring.current.velocity = 0;
    setVisualPosition(x);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const x = positionAt(event.clientX);
    const dt = Math.max(1, event.timeStamp - current.lastTime);
    current.velocity = (x - current.lastX) / dt * 1000;
    current.lastX = x;
    current.lastTime = event.timeStamp;
    spring.current.x = x;
    setVisualPosition(x);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const x = positionAt(event.clientX);
    const target = Math.round(clamp(x + current.velocity * 0.075));
    if (!availableModels[models[target]]) {
      drag.current = null;
      settleTo(models.indexOf(selectedModel));
      return;
    }
    spring.current.x = x;
    spring.current.velocity = current.velocity;
    drag.current = null;
    onModelChange(models[target]);
    settleTo(target);
  };

  const choose = (choice: WaslaModelChoice) => {
    if (!availableModels[choice]) return;
    onModelChange(choice);
    settleTo(models.indexOf(choice));
  };

  return (
    <div className={`chat-model-controls is-${selectedModel}`}>
      <button
        ref={trigger}
        type="button"
        className="chat-model-trigger"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
      >
        <span>{selectedName}</span>
        <ChevronDown size={14} />
      </button>
      {createPortal(
        <>
          <div
            ref={panel}
            id={id}
            popover="auto"
            className={`chat-model-panel is-${selectedModel}`}
            dir={ar ? "rtl" : "ltr"}
            onToggle={(event) => {
              const isOpen = event.newState === "open";
              setOpen(isOpen);
              if (isOpen) positionPanel();
            }}
          >
            <div className="chat-model-panel__header">
              <span className="chat-model-panel__eyebrow">{ar ? "نموذج وصلة" : "WASLA MODEL"}</span>
              <button
                type="button"
                className={`chat-model-panel__speed${reasoningMode === "fast" ? " is-fast" : ""}`}
                aria-pressed={reasoningMode === "fast"}
                aria-label={ar ? "تبديل سرعة 1.5×" : "Toggle 1.5× speed"}
                onClick={() => onReasoningModeChange(reasoningMode === "fast" ? "high" : "fast")}
              >
                <Zap size={13} strokeWidth={2.2} />
                <span>1.5×</span>
              </button>
            </div>
            <strong className="chat-model-panel__name">{names[selectedModel]}</strong>
            {selectedModel !== 'b2c' && <small className="chat-model-panel__coverage">{selectedModel === 'ultra' ? (ar ? 'أرقام هاتف مطلوبة' : 'Phone numbers required') : (ar ? 'مع رقم هاتف أو بدونه' : 'With or without phone numbers')}</small>}
            <div
              ref={rail}
              className="chat-model-panel__rail"
              role="slider"
              tabIndex={0}
              aria-label={ar ? "اختر نموذج وصلة" : "Choose Wasla model"}
              aria-valuemin={0}
              aria-valuemax={2}
              aria-valuenow={models.indexOf(selectedModel)}
              aria-valuetext={names[selectedModel]}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                drag.current = null;
                settleTo(models.indexOf(selectedModel));
              }}
              onKeyDown={(event) => {
                const current = models.indexOf(selectedModel);
                if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                  event.preventDefault();
                  choose(models.slice(current + 1).find((choice) => availableModels[choice]) ?? selectedModel);
                } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                  event.preventDefault();
                  choose([...models.slice(0, current)].reverse().find((choice) => availableModels[choice]) ?? selectedModel);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  choose(models.find((choice) => availableModels[choice]) ?? selectedModel);
                } else if (event.key === "End") {
                  event.preventDefault();
                  choose([...models].reverse().find((choice) => availableModels[choice]) ?? selectedModel);
                }
              }}
            >
              <span className="chat-model-panel__track" />
              <span className="chat-model-panel__progress" style={{ width: `calc((100% - 16px) * ${visualPosition / 2})` }} />
              {[0, 1, 2].map((index) => <span key={index} className={`chat-model-panel__stop is-${index}`} />)}
              <span className="chat-model-panel__thumb" style={{ left: `calc(8px + (100% - 16px) * ${visualPosition / 2})` }} />
            </div>
            <div className="chat-model-panel__labels" dir="ltr">
              {models.map((choice, index) => (
                <button key={choice} type="button" className={choice === selectedModel ? "is-selected" : ""} onClick={() => choose(choice)} aria-label={availableModels[choice] ? names[choice] : `${names[choice]} — admin approval required`} disabled={!availableModels[choice]} title={!availableModels[choice] ? (ar ? "يتطلب موافقة الإدارة" : "Admin approval required") : undefined}>
                  {!availableModels[choice] && <Lock size={10} aria-hidden="true" />}
                  {index === 0 ? "Lite" : index === 1 ? "Astraeus" : "Ultra"}
                </button>
              ))}
            </div>
          </div>
          {flash && <div key={flash.key} className={`chat-model-edge-flash is-${flash.model}`} aria-hidden="true" />}
        </>,
        document.body,
      )}
    </div>
  );
}
