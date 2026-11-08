import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]); // [{ tier, quantity }]
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [discountAmount, setDiscountAmount] = useState(0);

  // Reservation state
  const [activeOrder, setActiveOrder] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Compute subtotal in minor units (cents)
  const subtotal = cartItems.reduce((sum, item) => sum + (item.tier.price * item.quantity), 0);
  const total = Math.max(0, subtotal - discountAmount);

  // Countdown timer for 15m order hold
  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setActiveOrder(null);
        setExpiresAt(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const updateQuantity = (tier, quantity) => {
    const qty = parseInt(quantity, 10);
    setCartItems(prev => {
      const filtered = prev.filter(item => item.tier.id !== tier.id);
      if (qty > 0) {
        return [...filtered, { tier, quantity: qty }];
      }
      return filtered;
    });
  };

  const clearCart = () => {
    setCartItems([]);
    setPromoCode('');
    setAppliedPromo(null);
    setDiscountAmount(0);
    setActiveOrder(null);
    setExpiresAt(null);
  };

  const applyPromoCode = async (eventId, code) => {
    if (!code) return;
    const res = await api.post(`/events/${eventId}/promos/validate`, {
      code,
      subtotal,
    });
    if (res.valid) {
      setAppliedPromo(res.promo);
      setDiscountAmount(res.discount);
      setPromoCode(code);
    }
    return res;
  };

  const reserveTickets = async (eventId) => {
    if (cartItems.length === 0) {
      throw new Error('Please select at least one ticket');
    }

    const items = cartItems.map(item => ({
      ticket_tier_id: item.tier.id,
      quantity: item.quantity,
    }));

    const res = await api.post(`/public/events/${eventId}/order`, {
      items,
      promo_code: promoCode || undefined,
    });

    setActiveOrder(res.order || { id: res.orderId, orderShortId: res.orderShortId });
    setExpiresAt(res.expires_at);
    return res;
  };

  const finalizeCheckout = async (orderId, buyer, attendees, paymentMethod = 'OFFLINE') => {
    const res = await api.post(`/orders/${orderId}/checkout`, {
      buyer,
      attendees,
      payment_method: paymentMethod,
    });
    setActiveOrder(res.order);
    setExpiresAt(null);
    return res;
  };

  const cancelActiveOrder = async (orderId) => {
    const targetId = orderId || activeOrder?.id;
    if (!targetId) return;
    const res = await api.post(`/orders/${targetId}/cancel`, {});
    clearCart();
    return res;
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        updateQuantity,
        clearCart,
        subtotal,
        discountAmount,
        total,
        promoCode,
        appliedPromo,
        applyPromoCode,
        activeOrder,
        expiresAt,
        remainingSeconds,
        reserveTickets,
        finalizeCheckout,
        cancelActiveOrder,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartContext;
