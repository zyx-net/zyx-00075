import { Link } from 'react-router-dom'
import { Phone, Calendar, User, Clock } from 'lucide-react'
import { StatusBadge, PriorityBadge } from './StatusBadge'
import dayjs from 'dayjs'
import type { Ticket } from '../types'

interface TicketCardProps {
  ticket: Ticket
}

export default function TicketCard({ ticket }: TicketCardProps) {
  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-mono text-gray-500">{ticket.ticket_no}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">
            {ticket.device_type} {ticket.device_model}
          </h3>
        </div>
        <div className="flex items-center text-xs text-gray-500">
          <Clock className="h-3 w-3 mr-1" />
          v{ticket.version}
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{ticket.fault_description}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
        <div className="flex items-center">
          <User className="h-4 w-4 mr-1.5 text-gray-400" />
          <span>{ticket.customer_name}</span>
        </div>
        <div className="flex items-center">
          <Phone className="h-4 w-4 mr-1.5 text-gray-400" />
          <span>{ticket.customer_phone}</span>
        </div>
        {ticket.assignee_name && (
          <div className="flex items-center">
            <User className="h-4 w-4 mr-1.5 text-blue-500" />
            <span className="text-blue-600">{ticket.assignee_name}</span>
          </div>
        )}
        <div className="flex items-center">
          <Calendar className="h-4 w-4 mr-1.5 text-gray-400" />
          <span>{dayjs(ticket.created_at).format('MM-DD HH:mm')}</span>
        </div>
      </div>

      {ticket.estimated_cost !== null && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
          <span className="text-gray-500">预估费用</span>
          <span className="font-medium text-gray-900">¥{ticket.estimated_cost.toFixed(2)}</span>
        </div>
      )}

      {ticket.actual_cost !== null && (
        <div className="mt-1 flex justify-between text-sm">
          <span className="text-gray-500">实际费用</span>
          <span className="font-medium text-blue-600">¥{ticket.actual_cost.toFixed(2)}</span>
        </div>
      )}
    </Link>
  )
}
