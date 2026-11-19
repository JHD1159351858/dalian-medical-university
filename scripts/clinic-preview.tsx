import { createRoot } from 'react-dom/client'
import { ClinicWorkspace } from '../src/App'
import { TrainingCaseProvider } from '../src/cases/selectedCase'
import '../src/styles.css'

const label = <span className="session-chip">本机预览 · 接诊记录不存档</span>
createRoot(document.getElementById('root')!).render(
  <TrainingCaseProvider>{(redraw) => <ClinicWorkspace autoStart redraw={redraw} accountControls={label} />}</TrainingCaseProvider>,
)
