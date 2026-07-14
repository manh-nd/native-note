"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mic2, Sparkles } from "lucide-react";

type Session = { id: string; prompt: string };
type Item = { id: string; category: string; correctStreak: number };
type Assessment = {
  verdict: "correct" | "partially_correct" | "incorrect";
  feedbackVi: string;
  improvedAnswer: string;
  followUpEn: string;
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Yêu cầu thất bại.");
  return body;
}

export function PracticeView({
  onBack,
  onLive,
}: {
  onBack(): void;
  onLive(): void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [progress, setProgress] = useState<{
    correctStreak?: number;
    duplicateContext?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasDue, setHasDue] = useState<boolean | null>(null);

  async function start() {
    setLoading(true);
    setError("");
    setAssessment(null);
    setAnswer("");
    setIndex(0);
    setHasDue(null);
    try {
      const result = await json<{
        hasDueItems?: boolean;
        session: Session | null;
        items: Item[];
      }>("/api/practice/sessions", { method: "POST" });
      if (result.hasDueItems === false) {
        setHasDue(false);
        setSession(null);
        setItems([]);
      } else {
        setHasDue(true);
        setSession(result.session);
        setItems(result.items);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể tạo bài luyện."
      );
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!session || !items[index] || answer.trim().length < 3) return;
    setLoading(true);
    setError("");
    try {
      const result = await json<{
        assessment: Assessment;
        progress: { correctStreak?: number; duplicateContext?: boolean };
      }>(`/api/practice/sessions/${session.id}/attempts`, {
        method: "POST",
        body: JSON.stringify({ itemId: items[index].id, answer }),
      });
      setAssessment(result.assessment);
      setProgress(result.progress);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể chấm câu trả lời."
      );
    } finally {
      setLoading(false);
    }
  }

  function next() {
    if (index + 1 < items.length) {
      setIndex(index + 1);
      setAnswer("");
      setAssessment(null);
      setProgress(null);
    } else {
      setSession(null);
      setItems([]);
      setAssessment(null);
      setAnswer("");
    }
  }

  return (
    <section className="practice-page">
      <nav className="top-nav">
        <button className="soft-button" onClick={onBack}>
          <ArrowLeft size={15} /> Quay lại editor
        </button>
        <button className="soft-button" onClick={onLive}>
          <Mic2 size={15} /> Luyện nói
        </button>
      </nav>
      <header className="practice-hero">
        <div className="finding-category">Active recall</div>
        <h1>Cần luyện hôm nay</h1>
        <p>
          Không có đáp án để chọn. Bạn sẽ tự diễn đạt, nhận phản hồi, rồi thử
          lại trong một ngữ cảnh khác.
        </p>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!session ? (
        hasDue === false ? (
          <section className="practice-card">
            <CheckCircle2
              size={26}
              style={{ color: "var(--color-success, #10b981)" }}
            />
            <h2>Hôm nay đã hoàn thành!</h2>
            <p
              className="muted"
              style={{
                maxWidth: "440px",
                margin: "0.5rem auto 1.5rem auto",
                lineHeight: 1.6,
              }}
            >
              Tuyệt vời! Bạn đã hoàn thành tất cả các nội dung ôn tập cho hôm
              nay. Hãy tiếp tục viết ghi chú mới và lưu các gợi ý từ AI để hệ
              thống tạo thêm bài luyện nhé!
            </p>
            <button
              className="primary-button"
              onClick={start}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}{" "}
              Kiểm tra lại
            </button>
          </section>
        ) : (
          <section className="practice-card">
            <Sparkles size={26} />
            <h2>Bắt đầu một tình huống mới</h2>
            <p className="muted">
              AI sẽ chọn tối đa ba thói quen ngôn ngữ đang đến hạn và đặt chúng
              vào một tình huống thực tế.
            </p>
            <button
              className="primary-button"
              onClick={start}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}{" "}
              Tạo tình huống
            </button>
          </section>
        )
      ) : (
        <section className="practice-card">
          <div className="finding-category">
            Thử thách {index + 1}/{items.length} · Chuỗi hiện tại{" "}
            {items[index]?.correctStreak ?? 0}/3
          </div>
          <p style={{ whiteSpace: "pre-line", lineHeight: 1.7 }}>
            {assessment?.followUpEn ?? session.prompt}
          </p>
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Write your answer in English…"
            disabled={Boolean(assessment)}
            aria-label="Câu trả lời luyện tập"
          />
          {!assessment ? (
            <button
              className="primary-button"
              onClick={submit}
              disabled={loading || answer.trim().length < 3}
            >
              {loading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}{" "}
              Gửi để nhận phản hồi
            </button>
          ) : (
            <div className="verdict">
              <div className="finding-category">
                {assessment.verdict === "correct"
                  ? "Dùng đúng"
                  : assessment.verdict === "partially_correct"
                    ? "Gần đúng"
                    : "Cần thử lại"}
              </div>
              <p>{assessment.feedbackVi}</p>
              <p>
                <strong>Cách diễn đạt tốt hơn:</strong>{" "}
                {assessment.improvedAnswer}
              </p>
              {progress?.duplicateContext && (
                <p className="muted">
                  Ngữ cảnh này đã được luyện trước đó nên không tăng chuỗi thành
                  thạo.
                </p>
              )}
              <button className="primary-button" onClick={next}>
                {index + 1 < items.length ? "Tình huống tiếp theo" : "Hoàn tất"}
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
