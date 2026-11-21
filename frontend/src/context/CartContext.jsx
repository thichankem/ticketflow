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
  const [guestToken, setGuestToken] = useState(() => {
    try {
      return sessionStorage.getItem('tf_active_guest_token') || null;
    } catch {
      return null;
    }
  });
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
        // Automatically release backend inventory when timer expires
        if (activeOrder?.id) {
          api.post(`/orders/${activeOrder.id}/cancel`, {}).catch(() => {});
        }
        setActiveOrder(null);
        setExpiresAt(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, activeOrder]);

  const updateQuantity = (tier, quantity) => {
    const qty = parseInt(quantity, 10);
    setCartItems(prev => {
      const filtered = prev.filter(item => item.tier.id !== tier.id);
      let updated = filtered;
      if (qty > 0) {
        updated = [...filtered, { tier, quantity: qty }];
      }
      // Recalculate promo discount against updated subtotal
      if (appliedPromo) {
        const newSub = updated.reduce((sum, item) => sum + (item.tier.price * item.quantity), 0);
        const discountVal = Number(appliedPromo.discount ?? appliedPromo.discount_amount ?? 0);
        if (appliedPromo.discount_type === 'PERCENTAGE') {
          setDiscountAmount(Math.floor((newSub * discountVal) / 100));
        } else {
          setDiscountAmount(Math.min(newSub, discountVal));
        }
      }
      return updated;
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

    const token = res.session_token || res.guest_session_token || res.order?.session_token || res.order?.guest_session_token;
    if (token) {
      setGuestToken(token);
      try {
        sessionStorage.setItem(`tf_guest_token_${res.orderId}`, token);
        sessionStorage.setItem('tf_active_guest_token', token);
      } catch {}
    }

    const orderData = {
      ...(res.order || {}),
      id: res.orderId,
      orderShortId: res.orderShortId,
      session_token: token,
      guest_session_token: token,
    };

    setActiveOrder(orderData);
    setExpiresAt(res.expires_at);
    return { ...res, order: orderData, session_token: token };
  };

  const finalizeCheckout = async (orderId, buyer, attendees, paymentMethod = 'VNPAY') => {
    const token =
      guestToken ||
      activeOrder?.session_token ||
      (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(`tf_guest_token_${orderId}`) || sessionStorage.getItem('tf_active_guest_token')) : null);

    const res = await (api.orders.checkout
      ? api.orders.checkout(orderId, { buyer, attendees, payment_method: paymentMethod }, token)
      : api.post(`/orders/${orderId}/checkout`, {
          buyer,
          attendees,
          payment_method: paymentMethod,
          order_token: token,
          session_token: token,
        }));

    const finalOrder = res.order || { id: orderId, session_token: token };
    setActiveOrder({ ...finalOrder, session_token: token });
    setExpiresAt(null);
    return { ...res, order: { ...finalOrder, session_token: token }, session_token: token };
  };

  const cancelActiveOrder = async (orderId) => {
    const targetId = orderId || activeOrder?.id;
    if (!targetId) return;
    const token =
      guestToken ||
      activeOrder?.session_token ||
      (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(`tf_guest_token_${targetId}`) || sessionStorage.getItem('tf_active_guest_token')) : null);

    const res = await (api.orders.cancel
      ? api.orders.cancel(targetId, {}, token)
      : api.post(`/orders/${targetId}/cancel`, { order_token: token }));

    clearCart();
    return res;
  };

  const initiatePayment = async (orderId, paymentMethod = 'VNPAY') => {
    const targetId = orderId || activeOrder?.id;
    if (!targetId) throw new Error('Order ID required');
    const token =
      guestToken ||
      activeOrder?.session_token ||
      (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(`tf_guest_token_${targetId}`) || sessionStorage.getItem('tf_active_guest_token')) : null);

    const res = await (api.orders.processPayment
      ? api.orders.processPayment(targetId, { gateway: 'VNPAY', payment_method: paymentMethod }, token)
      : api.post(`/orders/${targetId}/payment`, { gateway: 'VNPAY', payment_method: paymentMethod, order_token: token }));

    return res;
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        guestToken,
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
        initiatePayment,
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
