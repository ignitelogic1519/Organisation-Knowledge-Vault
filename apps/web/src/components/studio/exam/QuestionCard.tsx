"use client";

import type { ExamQuestion, ExamQuestionType, ExamSettings } from "@vault/shared";
import { newOption, QUESTION_TYPES, retypeQuestion, setOptionCorrect } from "./model";

// One question on the paper, written the way a form is: the question, then its options,
// with the tick marking the right one. The card carries everything an author needs while
// writing; the rarer settings (weight, image, explanation) live in the inspector beside it.

export function QuestionCard({
  question,
  index,
  count,
  selected,
  settings,
  cardRef,
  onSelect,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
}: {
  question: ExamQuestion;
  index: number;
  count: number;
  selected: boolean;
  settings: ExamSettings;
  cardRef: (el: HTMLElement | null) => void;
  onSelect: () => void;
  onChange: (next: ExamQuestion) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const fixedOptions = question.type === "boolean"; // True/False is not editable text
  const marked = question.options.filter((o) => o.correct && o.text.trim()).length;
  const usable = question.options.filter((o) => o.text.trim()).length;

  const setOption = (optionId: string, text: string) =>
    onChange({
      ...question,
      options: question.options.map((o) => (o.id === optionId ? { ...o, text } : o)),
    });

  return (
    <article
      className="exam-card"
      data-selected={selected}
      ref={cardRef}
      onFocusCapture={onSelect}
      onClick={onSelect}
    >
      <div className="exam-card-head">
        <span className="exam-card-no">{index + 1}</span>
        <select
          className="exam-card-type"
          value={question.type}
          aria-label={`Question ${index + 1} type`}
          onChange={(e) => onChange(retypeQuestion(question, e.target.value as ExamQuestionType))}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        {settings.weighted && (
          <label className="exam-card-points">
            <span>Marks</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={question.points}
              onChange={(e) => onChange({ ...question, points: Number(e.target.value) || 0 })}
            />
          </label>
        )}
        <span className="exam-card-tools">
          <button
            type="button"
            className="icon-btn"
            title="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Move down"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button type="button" className="icon-btn" title="Duplicate" onClick={onDuplicate}>
            ⧉
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            title="Delete question"
            onClick={onRemove}
          >
            ✕
          </button>
        </span>
      </div>

      <textarea
        className="exam-card-prompt"
        rows={2}
        maxLength={4000}
        placeholder="Question"
        value={question.prompt}
        onChange={(e) => onChange({ ...question, prompt: e.target.value })}
      />
      <input
        className="exam-card-help"
        maxLength={500}
        placeholder="Helper text (optional)"
        value={question.help}
        onChange={(e) => onChange({ ...question, help: e.target.value })}
      />
      {question.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="exam-card-image" src={question.image} alt="" />
      )}

      <ul className="exam-options">
        {question.options.map((option, i) => (
          <li key={option.id} className="exam-option" data-correct={option.correct}>
            <input
              className="exam-option-mark"
              type={question.type === "multi" ? "checkbox" : "radio"}
              name={`correct-${question.id}`}
              checked={option.correct}
              aria-label={`Option ${i + 1} is a correct answer`}
              title="Mark as a correct answer"
              onChange={(e) => onChange(setOptionCorrect(question, option.id, e.target.checked))}
            />
            <input
              className="exam-option-text"
              maxLength={500}
              readOnly={fixedOptions}
              placeholder={`Option ${i + 1}`}
              value={option.text}
              onChange={(e) => setOption(option.id, e.target.value)}
            />
            {!fixedOptions && question.options.length > 2 && (
              <button
                type="button"
                className="icon-btn"
                title="Remove option"
                onClick={() =>
                  onChange({
                    ...question,
                    options: question.options.filter((o) => o.id !== option.id),
                  })
                }
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="exam-card-foot">
        {!fixedOptions && question.options.length < 12 && (
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => onChange({ ...question, options: [...question.options, newOption()] })}
          >
            + Add option
          </button>
        )}
        <span className="exam-card-state">
          {usable < 2
            ? "Needs at least two options"
            : marked === 0
              ? "No correct answer marked"
              : question.type !== "multi" && marked > 1
                ? "Only one answer may be correct"
                : `${marked} correct of ${usable}`}
        </span>
      </div>
    </article>
  );
}
