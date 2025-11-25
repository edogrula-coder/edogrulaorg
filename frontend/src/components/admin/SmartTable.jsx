// src/components/admin/SmartTable.jsx — Ultra Pro (live-ready, backwards compatible)
import React from "react";

/**
 * SmartTable
 *
 * Backwards compatible:
 *  - columns: [{ label, accessor, flex? }] aynı çalışır
 *  - rows: []
 *  - loading: boolean
 *
 * New (optional):
 *  - rowKey: string | (row, index)=>string  (default: "_id" || "id" || index)
 *  - onRowClick: (row)=>void
 *  - dense: boolean (daha sıkı görünüm)
 *  - stickyHeader: boolean
 *  - emptyText, loadingText
 *  - columns extras:
 *      id, sortable, sortAccessor, render, align, width, minWidth, maxWidth, className, headerClassName
 */
export default function SmartTable({
  columns = [],
  rows = [],
  loading = false,
  rowKey,
  onRowClick,
  dense = false,
  stickyHeader = false,
  emptyText = "Veri bulunamadı",
  loadingText = "Yükleniyor…",
  className,
  style,
  headerStyle,
  bodyStyle,
  maxHeight,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];

  // ---------- sorting ----------
  const [sortState, setSortState] = React.useState(null);
  // sortState: { id, dir: "asc" | "desc" }

  const toggleSort = (col, index) => {
    if (!col?.sortable) return;
    const id = col.id || col.accessor || String(index);
    setSortState((prev) => {
      if (!prev || prev.id !== id) return { id, dir: "asc" };
      if (prev.dir === "asc") return { id, dir: "desc" };
      return null; // 3. tık: sort kapat
    });
  };

  const sortedRows = React.useMemo(() => {
    if (!sortState) return safeRows;
    const col = columns.find((c, i) => {
      const id = c.id || c.accessor || String(i);
      return id === sortState.id;
    });
    if (!col) return safeRows;

    const getVal = (r) => {
      if (typeof col.sortAccessor === "function") return col.sortAccessor(r);
      if (typeof col.accessor === "function") return col.accessor(r);
      if (typeof col.accessor === "string") return r?.[col.accessor];
      return r?.[col.id];
    };

    const dir = sortState.dir === "desc" ? -1 : 1;

    return [...safeRows].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      // number compare
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * dir;
      }

      // date compare
      const da = va instanceof Date ? va.getTime() : Date.parse(va);
      const db = vb instanceof Date ? vb.getTime() : Date.parse(vb);
      if (Number.isFinite(da) && Number.isFinite(db)) {
        return (da - db) * dir;
      }

      // string compare
      return String(va).localeCompare(String(vb), "tr", { numeric: true }) * dir;
    });
  }, [safeRows, columns, sortState]);

  // ---------- key resolver ----------
  const resolveRowKey = React.useCallback(
    (r, i) => {
      if (typeof rowKey === "function") return rowKey(r, i);
      if (typeof rowKey === "string" && r?.[rowKey] != null) return String(r[rowKey]);
      if (r?._id != null) return String(r._id);
      if (r?.id != null) return String(r.id);
      return String(i);
    },
    [rowKey]
  );

  const pad = dense ? "8px 10px" : "10px 12px";
  const fontSize = dense ? 13 : 14;

  const containerStyle = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    overflow: "hidden",
    ...style,
  };

  const scrollerStyle = {
    overflowX: "auto",
    ...(maxHeight ? { maxHeight, overflowY: "auto" } : {}),
  };

  return (
    <div className={className} style={containerStyle}>
      <div style={scrollerStyle}>
        <table
          role="table"
          style={{ width: "100%", borderCollapse: "collapse", fontSize }}
        >
          <thead
            style={{
              background: "#f8fafc",
              ...(stickyHeader
                ? { position: "sticky", top: 0, zIndex: 1 }
                : {}),
              ...headerStyle,
            }}
          >
            <tr role="row">
              {columns.map((c, i) => {
                const id = c.id || c.accessor || String(i);
                const isSorted = sortState?.id === id;
                const dir = isSorted ? sortState.dir : null;

                return (
                  <th
                    key={id}
                    role="columnheader"
                    aria-sort={
                      dir ? (dir === "asc" ? "ascending" : "descending") : "none"
                    }
                    onClick={() => toggleSort(c, i)}
                    style={{
                      textAlign: c.align || "left",
                      padding: pad,
                      borderBottom: "1px solid #e5e7eb",
                      whiteSpace: "nowrap",
                      cursor: c.sortable ? "pointer" : "default",
                      userSelect: "none",
                      width: c.width,
                      minWidth: c.minWidth,
                      maxWidth: c.maxWidth,
                      ...c.headerStyle,
                    }}
                    className={c.headerClassName}
                    title={c.sortable ? "Sırala" : undefined}
                  >
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {c.label}
                      {c.sortable && (
                        <SortChevron active={!!dir} dir={dir} />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody role="rowgroup" style={bodyStyle}>
            {loading ? (
              <LoadingBlock
                colCount={columns.length}
                pad={pad}
                text={loadingText}
              />
            ) : sortedRows.length === 0 ? (
              <tr role="row">
                <td
                  role="cell"
                  colSpan={columns.length}
                  style={{ padding: 16, color: "#6b7280" }}
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              sortedRows.map((r, ri) => {
                const k = resolveRowKey(r, ri);
                return (
                  <tr
                    role="row"
                    key={k}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      cursor: onRowClick ? "pointer" : "default",
                      background:
                        onRowClick ? "transparent" : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (onRowClick) e.currentTarget.style.background = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      if (onRowClick) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {columns.map((c, ci) => {
                      const rawVal =
                        typeof c.accessor === "function"
                          ? c.accessor(r)
                          : typeof c.accessor === "string"
                          ? r?.[c.accessor]
                          : r?.[c.id];

                      const v =
                        typeof c.render === "function"
                          ? c.render(rawVal, r, ri)
                          : rawVal;

                      return (
                        <td
                          role="cell"
                          key={(c.id || c.accessor || ci) + ":" + ci}
                          className={c.className}
                          style={{
                            padding: pad,
                            whiteSpace: c.flex ? "normal" : "nowrap",
                            textAlign: c.align || "left",
                            verticalAlign: "top",
                            ...c.cellStyle,
                          }}
                        >
                          {v ?? "-"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------- small helpers -------------------- */

function SortChevron({ active, dir }) {
  const color = active ? "#111827" : "#9ca3af";
  const rotate = dir === "desc" ? "180deg" : "0deg";
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        transform: `rotate(${rotate})`,
        color,
        lineHeight: 1,
        fontSize: 10,
      }}
    >
      ▲
    </span>
  );
}

function LoadingBlock({ colCount, pad, text }) {
  return (
    <>
      <tr>
        <td colSpan={colCount} style={{ padding: 12, color: "#374151" }}>
          {text}
        </td>
      </tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={"sk_" + i}>
          {Array.from({ length: colCount }).map((__, j) => (
            <td key={"skc_" + i + "_" + j} style={{ padding: pad }}>
              <div
                style={{
                  height: 12,
                  width: `${30 + (j * 13) % 50}%`,
                  background:
                    "linear-gradient(90deg, rgba(0,0,0,.04), rgba(0,0,0,.08), rgba(0,0,0,.04))",
                  backgroundSize: "200% 100%",
                  animation: "st-sh 1.1s linear infinite",
                  borderRadius: 6,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
      <style>{`
        @keyframes st-sh { 
          0% { background-position: 0 0 } 
          100% { background-position: 200% 0 } 
        }
      `}</style>
    </>
  );
}
