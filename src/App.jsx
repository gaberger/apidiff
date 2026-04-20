import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import DiffViewer from './pages/DiffViewer';
import Settings from './pages/Settings';
import ChangesetSpec from './pages/ChangesetSpec';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/" element={<DiffViewer />} />
          <Route path="/changeset-spec" element={<ChangesetSpec />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/:integration" element={<DiffViewer />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
