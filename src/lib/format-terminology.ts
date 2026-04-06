export const APPLICATION_FORMATS = [
  "question_form",
  "structured_doc",
  "unstructured_doc",
] as const;

export type ApplicationFormat = (typeof APPLICATION_FORMATS)[number];

type FormatLabels = {
  item: string;
  items: string;
  answer: string;
  answers: string;
  itemNumber: (n: number) => string;
};

export const FORMAT_LABELS: Record<ApplicationFormat, FormatLabels> = {
  question_form: {
    item: "Question",
    items: "Questions",
    answer: "Answer",
    answers: "Answers",
    itemNumber: (n) => `Question ${n}`,
  },
  structured_doc: {
    item: "Section",
    items: "Sections",
    answer: "Content",
    answers: "Content",
    itemNumber: (n) => `Section ${n}`,
  },
  unstructured_doc: {
    item: "Document",
    items: "Document",
    answer: "Content",
    answers: "Content",
    itemNumber: () => "Document",
  },
};

export function getFormatLabels(format: ApplicationFormat): FormatLabels {
  return FORMAT_LABELS[format];
}

export function isApplicationFormat(value: unknown): value is ApplicationFormat {
  return APPLICATION_FORMATS.includes(value as ApplicationFormat);
}
