import React from 'react';

import type { PrintDocument } from './document';

/**
 * Renders a {@link PrintDocument} as the page that goes on paper.
 *
 * Presentation only — every value arrives already formatted by the builder, so
 * a number cannot differ between what was tested and what is printed.
 */
export function PrintDocumentView({ doc }: { doc: PrintDocument }): React.JSX.Element {
  return (
    <article className="print-doc">
      {doc.logoUrl ? (
        <div className="print-doc__logo">
          <img src={doc.logoUrl} alt="" />
        </div>
      ) : null}

      <h1 className="print-doc__title">{doc.title}</h1>
      {doc.subtitle ? <p className="print-doc__subtitle">{doc.subtitle}</p> : null}

      <dl className="print-doc__meta">
        {doc.meta.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      {doc.sections.map((section, index) => (
        <section className="print-doc__section" key={index}>
          {section.kind !== 'note' && section.heading ? (
            <h2 className="print-doc__heading">{section.heading}</h2>
          ) : null}

          {section.kind === 'table' ? (
            section.rows.length === 0 ? (
              <p className="print-doc__empty">{section.emptyText ?? 'Nothing to show.'}</p>
            ) : (
              <table className="print-doc__table">
                <thead>
                  <tr>
                    {section.columns.map((column) => (
                      <th key={column.label} className={column.align === 'right' ? 'num' : undefined}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={section.columns[cellIndex]?.align === 'right' ? 'num' : undefined}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {section.totals ? (
                    <tr className="print-doc__totals">
                      {section.totals.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={section.columns[cellIndex]?.align === 'right' ? 'num' : undefined}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )
          ) : null}

          {section.kind === 'keyValues' ? (
            <table className="print-doc__kv">
              <tbody>
                {section.items.map((item) => (
                  <tr key={item.label} className={item.strong ? 'strong' : undefined}>
                    <td>{item.label}</td>
                    <td>{item.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {section.kind === 'note' ? <p className="print-doc__note">{section.text}</p> : null}
        </section>
      ))}

      {doc.footnote ? <p className="print-doc__footnote">{doc.footnote}</p> : null}

      {doc.generatedAt ? (
        <p className="print-doc__generated">Generated {doc.generatedAt}</p>
      ) : null}
    </article>
  );
}
