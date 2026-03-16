import { FiAlertCircle, FiAlertTriangle, FiInfo } from 'react-icons/fi';

export function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case 'important':
      return <FiAlertCircle className="text-red-400" size={14} />;
    case 'warning':
      return <FiAlertTriangle className="text-amber-400" size={14} />;
    default:
      return <FiInfo className="text-blue-400" size={14} />;
  }
}
