export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', padding: '2rem', background: '#0a0a0a', color: '#fff' }}>
        {children}
      </body>
    </html>
  )
}
