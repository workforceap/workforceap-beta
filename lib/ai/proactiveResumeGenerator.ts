export async function generateResumeBullet(courseName: string): Promise<string> {
  // This workflow knows only that coursework completed. A title provides
  // no evidence of professional certification, assessed mastery, employment
  // or measured results. Keep the draft factual rather than ask a model to
  // invent accomplishments. Other resume-generation workflows are separate.
  const title = courseName.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  if (!title || /^[a-z0-9_-]+-course-\d+$/i.test(title)) return 'Completed a training course.';
  return `Completed coursework: ${title}.`;
}
