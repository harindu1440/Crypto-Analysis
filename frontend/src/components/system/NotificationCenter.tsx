import React, { useState, useEffect } from 'react';

export interface NotificationEvent {
  id: string;
  type: string;
  priority: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  link?: string;
  createdAt: number;
  read: boolean;
}

export const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/read/${id}`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (error) {
      console.error('Failed to mark read', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark all read', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'bg-red-500 text-white';
      case 'HIGH': return 'bg-orange-500 text-white';
      case 'MEDIUM': return 'bg-yellow-500 text-black';
      case 'LOW': return 'bg-blue-500 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg bg-[#1F2937] hover:bg-[#374151] transition-colors"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-h-[80vh] overflow-y-auto bg-[#111827] border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-[#111827] z-10">
            <h3 className="text-lg font-bold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Mark all as read
              </button>
            )}
          </div>
          
          <div className="divide-y divide-gray-800">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No new notifications
              </div>
            ) : (
              notifications.map(n => (
                <div 
                  key={n.id} 
                  className={`p-4 transition-colors ${n.read ? 'opacity-60 bg-transparent' : 'bg-[#1F2937] border-l-4 border-blue-500 hover:bg-[#374151]'}`}
                  onClick={() => !n.read && markAsRead(n.id)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${getPriorityColor(n.priority)}`}>
                        {n.priority}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(n.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <h4 className="text-sm font-semibold text-white mt-2 mb-1">{n.title}</h4>
                  <p className="text-xs text-gray-300 mb-2">{n.message}</p>
                  
                  {n.link && (
                    <a href={n.link} className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                      View Details →
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
