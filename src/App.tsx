import ErrorBoundary from "./component/ErrorBoundary";
import AppLayout from "./layout/AppLayout";

function App() {
  return (
    <ErrorBoundary>
      <AppLayout />
    </ErrorBoundary>
  );
}

export default App;
