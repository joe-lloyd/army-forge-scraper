import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';

export function ArmyDetailEmpty() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto px-4 py-32 text-center">
      <h2 className="mb-6 text-2xl font-bold">Army not found</h2>
      <Button onClick={() => navigate('/')} variant="primary">
        Back Home
      </Button>
    </div>
  );
}
