import { useQuery } from '@tanstack/react-query'
import { loadDashboardCounts } from '../../api/dashboard'
import { useAuth } from '../../auth/AuthProvider'
import { ErrorBox, Loading } from '../../components/ui'

export function DashboardPage() {
  const { state } = useAuth()
  const q = useQuery({ queryKey: ['dashboard'], queryFn: loadDashboardCounts })
  const name = state.status === 'ready' ? state.profile.full_name : ''
  return (
    <section>
      <h1>Welcome, {name}</h1>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox error={q.error} retry={() => void q.refetch()} />}
      {q.data && (
        <div className="cards">
          <div className="card">
            <div className="card-num">{q.data.products}</div>
            <div>Products</div>
          </div>
          <div className="card">
            <div className="card-num">{q.data.published}</div>
            <div>Published on website</div>
          </div>
          <div className="card">
            <div className="card-num">{q.data.devicesInStock}</div>
            <div>Phones in stock</div>
          </div>
          <div className="card">
            <div className="card-num">{q.data.accessorySkus}</div>
            <div>Accessory SKUs</div>
          </div>
        </div>
      )}
      <p className="muted">Start a sale from New sale, receive stock under Purchases, and check stock under Inventory.</p>
    </section>
  )
}
