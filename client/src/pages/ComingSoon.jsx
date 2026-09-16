import { Link } from 'react-router-dom';

export default function ComingSoon({ phaseLabel, feature }) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <h1 className="text-h2 mb-2">{feature}</h1>
      <p className="text-ink-soft">
        This is part of {phaseLabel} and will be available in an upcoming release.
      </p>
      <Link to="/" className="inline-block mt-6 text-brand underline font-medium">
        Return to Home
      </Link>
    </div>
  );
}
