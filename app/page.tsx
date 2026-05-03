export default function Page() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem', background: 'linear-gradient(to right, #00c6ff, #0072ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Vera AI Backend
      </h1>
      <p style={{ color: '#888', fontSize: '1.2rem', marginBottom: '2rem' }}>
        The backend API is running successfully.
      </p>
      <div style={{ padding: '1rem', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #333' }}>
        <p style={{ margin: 0, fontFamily: 'monospace', color: '#00c6ff' }}>Base URL: /v1</p>
      </div>
    </main>
  )
}
