import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { parseDateKey, toDateKey, todayKey } from "../dates";
import ContributionGraph from "../components/ContributionGraph";
import DiaryPanel from "../components/DiaryPanel";
import ProfileSidebar from "../components/ProfileSidebar";
import TodosPanel from "../components/TodosPanel";

function yearAgoKey() {
  const d = parseDateKey(todayKey());
  d.setFullYear(d.getFullYear() - 1);
  return toDateKey(d);
}

export default function Overview({ user, onEditSettings }) {
  const [selected, setSelected] = useState(todayKey());
  const [diaryDates, setDiaryDates] = useState(() => new Set());
  const [contributions, setContributions] = useState(null);
  const [contributionsError, setContributionsError] = useState(null);
  const [openTodos, setOpenTodos] = useState(null);
  const dirtyRef = useRef(false);
  const diaryRef = useRef(null);

  useEffect(() => {
    api
      .contributions()
      .then(setContributions)
      .catch((err) => setContributionsError(err.body?.reauth ? "reauth" : err.message));
    api
      .listDiary(yearAgoKey(), todayKey())
      .then((entries) => setDiaryDates(new Set(entries.map((e) => e.entry_date))))
      .catch(() => {});
  }, []);

  const selectDate = useCallback((key, { scroll = false } = {}) => {
    if (dirtyRef.current && !window.confirm("Discard unsaved changes to this entry?")) return;
    setSelected(key);
    if (scroll) diaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const onEntryChange = useCallback((date, exists) => {
    setDiaryDates((prev) => {
      const next = new Set(prev);
      if (exists) next.add(date);
      else next.delete(date);
      return next;
    });
  }, []);

  return (
    <div className="profile-layout">
      <ProfileSidebar
        user={user}
        contributions={contributions}
        diaryDates={diaryDates}
        openTodos={openTodos}
        onEditSettings={onEditSettings}
      />
      <div className="profile-main">
        <ContributionGraph
          data={contributions}
          error={contributionsError}
          diaryDates={diaryDates}
          selected={selected}
          onSelect={(key) => selectDate(key, { scroll: true })}
        />
        <div ref={diaryRef} className="scroll-anchor">
          <DiaryPanel selected={selected} onSelect={selectDate} dirtyRef={dirtyRef} onEntryChange={onEntryChange} />
        </div>
        <TodosPanel remindersActive={!!user.email && user.reminders_enabled} onOpenCountChange={setOpenTodos} />
      </div>
    </div>
  );
}
