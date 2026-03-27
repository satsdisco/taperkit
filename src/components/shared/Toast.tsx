import React, { createContext, useContext, useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const borderColor = (type: ToastType) => {
    if (type === 'error') return 'var(--error)'
    if (type === 'success') return 'var(--success)'
    return 'var(--border)'
  }

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              background: 'var(--surface)',
              border: `1px solid ${borderColor(toast.type)}`,
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: '260px',
              maxWidth: '400px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              color: 'var(--text)',
              fontSize: '13px',
              pointerEvents: 'all',
              animation: 'toastIn 0.2s ease',
            }}
          >
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                padding: '0',
                fontSize: '16px',
                lineHeight: 1,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
