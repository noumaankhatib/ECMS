import { redirect } from 'next/navigation';

import { currentSession } from '@/lib/session';

/** The front door. Signed in goes to the work; otherwise, to sign in. */
export default async function Home() {
  const session = await currentSession();
  redirect(session ? '/projects' : '/login');
}
