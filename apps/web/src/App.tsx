import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui/primitives';
import HomePage from '@/pages/HomePage';

const ReflectPage = lazy(() => import('@/features/studentgpt/ReflectPage'));
const LearnHome = lazy(() => import('@/features/classroom/LearnHome'));
const NewClassroom = lazy(() => import('@/features/classroom/NewClassroom'));
const ClassroomPage = lazy(() => import('@/features/classroom/ClassroomPage'));
const LessonPage = lazy(() => import('@/features/classroom/LessonPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const InfoPage = lazy(() => import('@/pages/InfoPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

const Fallback = () => (
  <div className="grid min-h-dvh place-items-center">
    <Spinner label="Loading" />
  </div>
);

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/reflect" element={<ReflectPage />} />
          <Route path="/reflect/:conversationId" element={<ReflectPage />} />
          <Route path="/learn" element={<LearnHome />} />
          <Route path="/learn/new" element={<NewClassroom />} />
          <Route path="/learn/:classroomId" element={<ClassroomPage />} />
          <Route path="/learn/:classroomId/lesson/:lessonId" element={<LessonPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/safety" element={<InfoPage page="safety" />} />
          <Route path="/privacy" element={<InfoPage page="privacy" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
