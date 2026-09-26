import ReactMarkdown from 'react-markdown';

/** The resource page title owns h1; content headings start one level below it. */
export default function ResourceMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h2>{children}</h2>,
        h2: ({ children }) => <h3>{children}</h3>,
        h3: ({ children }) => <h4>{children}</h4>,
        h4: ({ children }) => <h5>{children}</h5>,
        h5: ({ children }) => <h6>{children}</h6>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
