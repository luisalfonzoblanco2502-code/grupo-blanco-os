export function DashboardGrid({ children }) {
  return (
    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "1rem 0 1.5rem" }}>
      {children}
    </div>
  );
}
