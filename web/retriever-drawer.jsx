// Agent Drawer — right-side contextual panel

function AgentDrawer({ taskId, intent, context, onClose }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);

  React.useEffect(() => {
    if (!taskId) return;
    const t = TICKETS.find(x => x.task_id === taskId);
    const opener = openerFor(intent, t, context);
    setMessages([{ role: "agent", tool: "gemma4", steps: opener.steps, text: opener.text, chips: opener.chips }]);
  }, [taskId, intent, context && context.index]);

  const send = (text) => {
    if (!text.trim()) return;
    setMessages(m => [...m, { role: "user", text }]);
    setInput("");
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMessages(m => [...m, replyFor(text, taskId, intent)]);
    }, 650);
  };

  if (!taskId) return null;
  const t = TICKETS.find(x => x.task_id === taskId);

  return (
    <div className="fixed inset-y-0 right-0 flex" style={{ zIndex: 50 }}>
      <div className="fixed inset-0" style={{ background: "rgba(26,26,26,0.25)" }} onClick={onClose}></div>
      <aside className="relative bg-white h-full flex flex-col shadow-2xl border-l"
             style={{ width: 440, borderColor: "#E8E6DE" }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#E8E6DE" }}>
          <div className="flex items-center gap-2">
            <Sparkle size={14}/>
            <span className="text-[13px] font-semibold text-[#1A1A1A]">Gemma4</span>
            <OnDeviceBadge/>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono" style={{ color: "#8A8680" }}>{intent}</span>
            <button onClick={onClose} className="w-7 h-7 rounded hover:bg-[#F3F1EC] text-[#8A8680]">✕</button>
          </div>
        </div>

        <div className="px-4 py-2 border-b text-[11px] font-mono" style={{ borderColor: "#E8E6DE", background: "#FAFAF7", color: "#5C5A55" }}>
          context: {t.project}/{t.task_id}
          <span className="ml-2" style={{ color: "#8A8680" }}>· {t.attachments} attachments · {(t.criteria || []).length} criteria</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => <Message key={i} m={m} onChip={send}/>)}
          {thinking && (
            <div className="flex items-center gap-2 text-[12px]" style={{ color: "#8A8680" }}>
              <Sparkle size={11}/>
              <span>Gemma4 thinking</span>
              <Dots/>
            </div>
          )}
        </div>

        <div className="border-t p-3" style={{ borderColor: "#E8E6DE" }}>
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
                   onKeyDown={e => e.key === "Enter" && send(input)}
                   placeholder="ask about this bundle…"
                   className="flex-1 px-3 py-2 rounded-md border text-[13px] focus:outline-none"
                   style={{ borderColor: "#E8E6DE", background: "#FAFAF7" }}/>
            <button onClick={() => send(input)} className="px-3 py-2 rounded-md text-white text-[12px]" style={{ background: "#C26F4A" }}>send</button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] font-mono" style={{ color: "#8A8680" }}>
            <span>⌘/ for commands · esc to close</span>
            <span>all calls local — no data leaves device</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Message({ m, onChip }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-lg text-[13px]"
             style={{ background: "#1A1A1A", color: "#FDFCF7" }}>{m.text}</div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "#FBEFE8" }}>
        <Sparkle size={11}/>
      </div>
      <div className="flex-1 min-w-0">
        {m.steps && m.steps.length > 0 && (
          <div className="mb-2 rounded-md border overflow-hidden" style={{ borderColor: "#E8E6DE" }}>
            {m.steps.map((s, i) => (
              <div key={i} className="px-3 py-1.5 text-[11px] font-mono flex items-center gap-2 border-b last:border-0"
                   style={{ borderColor: "#F0EEE6", background: i === m.steps.length - 1 ? "#FAFAF7" : "#FFFFFF", color: "#5C5A55" }}>
                <span style={{ color: s.done ? "#5A8C6F" : "#C26F4A" }}>{s.done ? "✓" : "→"}</span>
                <span className="text-[#1A1A1A]">{s.tool}</span>
                <span className="text-[#8A8680]">{s.args}</span>
              </div>
            ))}
          </div>
        )}
        <div className="text-[13px] leading-relaxed text-[#1A1A1A] whitespace-pre-wrap">{m.text}</div>
        {m.chips && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.chips.map((c, i) => (
              <button key={i} onClick={() => onChip(c)}
                className="text-[11px] px-2 py-1 rounded border"
                style={{ borderColor: "#E8E6DE", background: "#FAFAF7", color: "#3A3A36" }}>{c}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1 h-1 rounded-full" style={{
          background: "#C26F4A",
          animation: `rtvPulse 1s ${i * 0.15}s infinite ease-in-out`,
        }}></span>
      ))}
    </span>
  );
}

function openerFor(intent, t, context) {
  if (intent === "verify_completion") {
    const unchecked = (t.criteria || []).filter(c => !c.done);
    return {
      steps: [
        { tool: "rtv_open_ticket",     args: `(task_id="${t.task_id}")`, done: true },
        { tool: "rtv_read_attachments",args: `(count=${t.attachments})`, done: true },
        { tool: "check_criteria",      args: `(${t.criteria.length} items)`, done: true },
      ],
      text: unchecked.length === 0
        ? `3개 criteria 모두 증거와 함께 충족되었습니다. status=done 으로 이동할 준비가 되었습니다.`
        : `${unchecked.length}개 criteria 가 아직 증거를 찾지 못했습니다:\n\n${unchecked.map((c, i) => `${i+1}. ${c.text}`).join("\n")}\n\n이 항목들에 대한 증거(세션 로그·커밋·테스트)가 첨부에 있는지 확인해볼까요?`,
      chips: ["evidence 찾기", "증거 없으면 review로 돌리기", "무시하고 done"],
    };
  }
  if (intent === "verify_criterion") {
    const c = (t.criteria || [])[context.index];
    return {
      steps: [
        { tool: "rtv_open_ticket",      args: `(task_id="${t.task_id}")`, done: true },
        { tool: "scan_attachments_for", args: `(q="${(c?.text || '').slice(0, 24)}…")`, done: true },
      ],
      text: c?.evidence
        ? `이미 증거가 기록되어 있습니다: ${c.evidence}\n\n재확인이 필요한가요?`
        : `첨부에서 "${c?.text}" 관련 근거를 찾지 못했습니다. 최근 세션 로그나 커밋 메시지를 연결해 주시면 criterion을 체크할 수 있습니다.`,
      chips: ["세션에서 찾아줘", "커밋 메시지 검색", "skip"],
    };
  }
  if (intent === "diagnose_stalled") {
    const days = Math.max(1, Math.round((Date.parse(TODAY) - Date.parse(t.stalled_since || t.updated)) / 86400000));
    return {
      steps: [
        { tool: "rtv_open_ticket", args: `(task_id="${t.task_id}")`, done: true },
        { tool: "read_activity",   args: `(limit=20)`, done: true },
        { tool: "classify_blocker",args: `()`, done: true },
      ],
      text: `${days}일째 멈춰 있습니다. ${t.blocked_reason ? `원인: ${t.blocked_reason}.` : "마지막 활동은 외부 의존(리뷰/정보) 대기로 보입니다."}\n\n진행 옵션:\n• 외부에 핑 — 담당자에게 후속 메시지\n• 범위 축소 — 의존 없는 부분만 먼저 진행\n• Park — 명시적으로 보류(30일) 처리`,
      chips: ["ping 초안 작성", "범위 축소 제안", "park 30d"],
    };
  }
  return {
    steps: [
      { tool: "rtv_open_ticket",     args: `(task_id="${t.task_id}")`, done: true },
      { tool: "rtv_read_attachments",args: `(count=${t.attachments})`, done: true },
    ],
    text: `"${t.summary}" 번들을 모두 읽었습니다. 무엇이 궁금하신가요?`,
    chips: ["요약해줘", "다음 단계 제안", "누락된 증거 찾기"],
  };
}

function replyFor(text, taskId, intent) {
  const t = TICKETS.find(x => x.task_id === taskId);
  const q = text.toLowerCase();
  if (q.includes("요약")) {
    const s = SUMMARIES[taskId];
    return { role: "agent", steps: [{ tool: "rtv_read_summary", args: "()", done: true }],
      text: s ? s.body : "아직 요약이 생성되지 않았습니다. 첨부를 추가하고 재생성하세요.",
      chips: ["재생성", "첨부별로 분리해서"] };
  }
  if (q.includes("다음") || q.includes("next")) {
    return { role: "agent", text: `현재 미완료 criteria 기준, 우선순위는:\n1. ${(t.criteria||[]).filter(c=>!c.done)[0]?.text || "모든 항목 완료"}\n\n이 작업에 30~60분 블록을 확보하시겠어요?`,
      chips: ["30분 블록 추가", "60분 블록 추가"] };
  }
  if (q.includes("ping") || q.includes("핑")) {
    return { role: "agent", steps: [{ tool: "draft_message", args: "()", done: true }],
      text: `> 안녕하세요. 지난 주 ${t.summary} 관련 리뷰 건 상태 확인 요청드립니다. 4/28 재리뷰 예정이었으나 일정 확인 부탁드립니다.\n\n이 초안으로 전송할까요?`,
      chips: ["전송", "수정", "취소"] };
  }
  return { role: "agent", text: `"${text}" — 이 번들에서는 세부 근거를 찾기 어렵습니다. 다른 각도에서 질문해 주세요.`,
    chips: ["요약", "다음 단계", "누락된 증거"] };
}

Object.assign(window, { AgentDrawer });
