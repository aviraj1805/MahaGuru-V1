export type User = {
  id: string;
  email: string | null;
  display_name: string | null;
  is_guest: boolean;
  profile: { field_of_study?: string; year_of_study?: string; interests?: string };
  created_at: string;
};

export type Usage = Record<'message' | 'classroom', { used: number; limit: number }>;
export type Session = { user: User | null; usage: Usage | null };

// ---------------------------------------------------------------- StudentGPT
export type Stage = 'opening' | 'exploring' | 'deepening' | 'reflecting' | 'clarity';
export type Helpline = { name: string; contact: string; href: string };

export type ConversationSummary = {
  id: string;
  title: string;
  stage: Stage;
  has_clarity: boolean;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; created_at: string };

export type Clarity = {
  came_with: string;
  underneath: string;
  insights: string[];
  assumptions_to_question: string[];
  questions_to_sit_with: string[];
  next_step: string | null;
  learning_goal: string | null;
};

export type Explored = {
  stage: Stage;
  presenting_concern: string;
  insights: string[];
  open_threads: string[];
};

export type Conversation = ConversationSummary & {
  messages: ChatMessage[];
  explored: Explored;
  clarity: Clarity | null;
  risk_level: 'none' | 'elevated' | 'crisis';
  helplines: Helpline[];
};

// ---------------------------------------------------------------- Classroom
export type IntakeQuestion = {
  id: string;
  question: string;
  options: string[];
  allow_free_text: boolean;
};

export type AssessmentItem = {
  id: string;
  type: 'mcq' | 'short';
  question: string;
  options: string[];
  concept: string;
  difficulty: 'easy' | 'medium' | 'hard';
};

export type ItemResult = {
  id: string;
  score: number;
  feedback: string;
  explanation?: string;
  correct_index?: number | null;
  chosen_index?: number | null;
};

export type Assessment = {
  id: string;
  kind: 'diagnostic' | 'quiz';
  lesson_id: string | null;
  status: 'pending' | 'graded';
  items: AssessmentItem[];
  results: ItemResult[] | null;
  responses: Record<string, string | number> | null;
  score: number | null;
};

export type LessonStatus = 'not_started' | 'in_progress' | 'needs_review' | 'completed';

export type LessonSummary = {
  id: string;
  module_id: string;
  title: string;
  objectives: string[];
  concepts: string[];
  est_minutes: number;
  status: LessonStatus;
  best_score: number | null;
  has_content: boolean;
};

export type RubricCriterion = { criterion: string; description: string; points: number };

export type AssignmentT = {
  id: string;
  brief_md: string;
  deliverables: string[];
  rubric: RubricCriterion[];
  submission: string | null;
  feedback: {
    scores: { criterion: string; points: number; max: number; comment: string }[];
    overall_feedback_md: string;
    next_improvements: string[];
  } | null;
  score: number | null;
  status: 'open' | 'graded';
};

export type ModuleT = {
  id: string;
  position: number;
  title: string;
  summary: string;
  milestone: string;
  lessons: LessonSummary[];
  assignment: AssignmentT | null;
};

export type Progress = {
  summary: {
    lessons_total: number;
    lessons_completed: number;
    percent: number;
    needs_review: number;
    minutes_remaining: number;
    milestones_reached: number;
    milestones_total: number;
  };
  next_lesson_id: string | null;
  next_lesson_title: string | null;
  modules: { id: string; completed: number; total: number; done: boolean }[];
  mastery: { concept: string; score: number; attempts: number }[];
};

export type PlannedModule = {
  title: string;
  summary: string;
  milestone: string;
  lessons: { title: string; objectives: string[]; concepts: string[]; est_minutes: number }[];
};

export type ClassroomT = {
  id: string;
  title: string;
  goal_text: string;
  status: 'intake' | 'diagnostic' | 'active' | 'completed';
  intake: { goal_restated?: string; questions?: IntakeQuestion[]; answers?: Record<string, string> };
  learner_profile: { level?: string; summary?: string; strengths?: string[]; gaps?: string[] };
  roadmap_summary: string | null;
  roadmap_version: number;
  modules: ModuleT[];
  progress: Progress | null;
  pending_assessment: Assessment | null;
  pending_revision: {
    id: string;
    version: number;
    reason: string;
    change_summary: string;
    modules: PlannedModule[];
  } | null;
  created_at: string;
  updated_at: string;
};

export type ClassroomSummary = {
  id: string;
  title: string;
  goal_text: string;
  status: ClassroomT['status'];
  percent: number;
  next_lesson_id: string | null;
  next_lesson_title: string | null;
  updated_at: string;
};

export type Resource = { title: string; url: string; kind: string; why: string };

export type LessonDetail = LessonSummary & {
  module_title: string;
  content_md: string | null;
  key_takeaways: string[];
  resources: Resource[];
  remedial_md: string | null;
  latest_quiz: Assessment | null;
  chat: { id: string; role: 'user' | 'assistant'; content: string; created_at: string }[];
  prev_lesson_id: string | null;
  next_lesson_id: string | null;
};

export type SubmitResult = {
  assessment: Assessment;
  lesson: (LessonSummary & { remedial_md: string | null }) | null;
  classroom: ClassroomT;
};
