import { redirect } from 'next/navigation';

export default function Page() {
  const isLoggedIn = false;

  if (!isLoggedIn) {
    redirect('/signin');
  }

  redirect('/home');
}