/**
 * ExceptionOpsPage now renders the Transaction Matching workspace.
 * This keeps the existing /exception-ops route stable while showing the
 * intended matching UI instead of redirecting in a loop.
 */
import TransactionMatchingWorkspace from './TransactionMatchingWorkspace'

export default function ExceptionOpsPage() {
  return <TransactionMatchingWorkspace />
}
