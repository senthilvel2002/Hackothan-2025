export default function NotFound() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-4 text-lg">Page not found</p>
        <a
          className="mt-4 inline-block text-blue-600 hover:underline"
          href="/"
        >
          Go to home
        </a>
      </div>
    </div>
  );
}

