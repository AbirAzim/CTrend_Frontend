import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function DateTimePicker({
  value,
  onChange,
  minDate,
  label,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
  label?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const [datePart, timePart] = value ? value.split("T") : ["", ""];

  const today = new Date();
  const minDateMs = minDate ? new Date(minDate).getTime() : null;

  const [viewYear, setViewYear] = useState(
    datePart ? Number(datePart.split("-")[0]) : today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    datePart ? Number(datePart.split("-")[1]) - 1 : today.getMonth(),
  );

  useEffect(() => {
    if (!datePart) return;
    const [y, m] = datePart.split("-").map(Number);
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [datePart]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const popoverWidth = Math.min(340, Math.max(300, window.innerWidth - 16));
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 8) {
        left = window.innerWidth - popoverWidth - 8;
      }
      left = Math.max(8, left);

      const estimatedHeight = 360;
      let top = rect.bottom + 8;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 8);
      }

      setPopoverStyle({
        position: "fixed",
        top,
        left,
        width: popoverWidth,
        maxWidth: popoverWidth,
        zIndex: 10050,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, viewMonth, viewYear]);

  const fallbackTimeSource = minDate ? new Date(minDate) : today;
  const fallbackHour24 = Number.isNaN(fallbackTimeSource.getTime())
    ? today.getHours()
    : fallbackTimeSource.getHours();
  const fallbackMinute = Number.isNaN(fallbackTimeSource.getTime())
    ? today.getMinutes()
    : fallbackTimeSource.getMinutes();
  const fallbackTimeStr = `${String(fallbackHour24).padStart(2, "0")}:${String(fallbackMinute).padStart(2, "0")}`;

  let hour12 = 12;
  let minute = 0;
  let ampm: "AM" | "PM" = "AM";
  {
    const [h, m] = (timePart || fallbackTimeStr).split(":").map(Number);
    minute = m ?? 0;
    if (h === 0) {
      hour12 = 12;
      ampm = "AM";
    } else if (h < 12) {
      hour12 = h;
      ampm = "AM";
    } else if (h === 12) {
      hour12 = 12;
      ampm = "PM";
    } else {
      hour12 = h - 12;
      ampm = "PM";
    }
  }

  function toDateStr(y: number, mo: number, d: number) {
    return `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function toTimeStr(h12: number, min: number, ap: "AM" | "PM") {
    const h24 = ap === "AM" ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;
    return `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  function selectDay(y: number, mo: number, d: number) {
    onChange(`${toDateStr(y, mo, d)}T${timePart || fallbackTimeStr}`);
  }

  function updateTime(h12: number, min: number, ap: "AM" | "PM") {
    const d =
      datePart ||
      (() => {
        const t = today;
        return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
      })();
    onChange(`${d}T${toTimeStr(h12, min, ap)}`);
  }

  const [hourDraft, setHourDraft] = useState(String(hour12).padStart(2, "0"));
  const [minDraft, setMinDraft] = useState(String(minute).padStart(2, "0"));
  useEffect(() => {
    setHourDraft(String(hour12).padStart(2, "0"));
  }, [hour12]);
  useEffect(() => {
    setMinDraft(String(minute).padStart(2, "0"));
  }, [minute]);

  function commitHour(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "").slice(0, 2);
    const n = cleaned ? Math.max(1, Math.min(12, Number(cleaned))) : hour12;
    updateTime(n, minute, ampm);
    setHourDraft(String(n).padStart(2, "0"));
  }

  function commitMinute(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "").slice(0, 2);
    const n = cleaned ? Math.max(0, Math.min(59, Number(cleaned))) : minute;
    updateTime(hour12, n, ampm);
    setMinDraft(String(n).padStart(2, "0"));
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".ig-dtp-popover--portal")) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

  type Cell = { day: number; year: number; month: number; outside: boolean };
  const cells: Cell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const mo = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: daysInPrev - firstWeekday + 1 + i, year: y, month: mo, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, year: viewYear, month: viewMonth, outside: false });
  }
  const weeksNeeded = Math.ceil((firstWeekday + daysInMonth) / 7);
  const targetLength = weeksNeeded * 7;
  while (cells.length < targetLength) {
    const d = cells.length - firstWeekday - daysInMonth + 1;
    const mo = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: d, year: y, month: mo, outside: true });
  }

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const displayDate = datePart
    ? new Date(`${datePart}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const displayTime = `${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;

  return (
    <div className="ig-dtp-wrap" ref={wrapRef} id={id} aria-label={label}>
      <button
        ref={triggerRef}
        type="button"
        className={`ig-dtp-trigger${open ? " ig-dtp-trigger--open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="ig-dtp-trigger-date">
          <span className="ig-dtp-icon" aria-hidden>📅</span>
          {displayDate ?? <span className="ig-dtp-placeholder">Pick date</span>}
        </span>
        <span className="ig-dtp-sep" aria-hidden />
        <span className="ig-dtp-trigger-time">
          <span className="ig-dtp-icon" aria-hidden>🕐</span>
          {displayTime}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className="ig-dtp-popover ig-dtp-popover--portal"
            style={popoverStyle}
            role="dialog"
            aria-label={label ?? "Choose date and time"}
          >
            <div className="ig-dtp-cal-header">
              <button type="button" className="ig-dtp-cal-nav" onClick={prevMonth} aria-label="Previous month">
                ‹
              </button>
              <span className="ig-dtp-cal-month-label">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button type="button" className="ig-dtp-cal-nav" onClick={nextMonth} aria-label="Next month">
                ›
              </button>
            </div>

            <div className="ig-dtp-cal-grid">
              {DAYS.map((d) => (
                <span key={d} className="ig-dtp-cal-dayname">
                  {d}
                </span>
              ))}
              {cells.map((cell, i) => {
                const cellEndMs = new Date(cell.year, cell.month, cell.day, 23, 59, 59, 999).getTime();
                const isSelected = datePart === toDateStr(cell.year, cell.month, cell.day);
                const isToday =
                  cell.day === today.getDate() &&
                  cell.month === today.getMonth() &&
                  cell.year === today.getFullYear();
                const isDisabled = minDateMs != null && cellEndMs < minDateMs;
                return (
                  <button
                    key={i}
                    type="button"
                    className={[
                      "ig-dtp-cal-day",
                      isSelected && "ig-dtp-cal-day--selected",
                      isToday && !isSelected && "ig-dtp-cal-day--today",
                      cell.outside && "ig-dtp-cal-day--outside",
                      isDisabled && "ig-dtp-cal-day--disabled",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      if (!isDisabled) selectDay(cell.year, cell.month, cell.day);
                    }}
                    disabled={isDisabled}
                    tabIndex={cell.outside ? -1 : 0}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            <div className="ig-dtp-divider" />

            <div className="ig-dtp-time-row">
              <span className="ig-dtp-time-label">Time</span>
              <div className="ig-dtp-time-selects">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  className="ig-dtp-time-input"
                  value={hourDraft}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setHourDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                  onBlur={(e) => commitHour(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  aria-label="Hour"
                />
                <span className="ig-dtp-time-colon" aria-hidden>
                  :
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  className="ig-dtp-time-input"
                  value={minDraft}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setMinDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                  onBlur={(e) => commitMinute(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  aria-label="Minute"
                />
                <button
                  type="button"
                  className="ig-dtp-ampm-btn"
                  onClick={() => updateTime(hour12, minute, ampm === "AM" ? "PM" : "AM")}
                  aria-label={`Toggle AM/PM, currently ${ampm}`}
                >
                  {ampm}
                </button>
              </div>
            </div>

            <div className="ig-dtp-footer">
              <button
                type="button"
                className="ig-dtp-btn-clear"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
              <button type="button" className="ig-dtp-btn-done" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
