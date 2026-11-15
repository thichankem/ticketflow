import React, { createContext, useContext, useState, useEffect } from 'react';

export const DICTIONARY = {
  vi: {
    // Navigation & Common Layouts
    'nav.explore': 'Khám Phá Sự Kiện',
    'nav.my_tickets': 'Vé Của Tôi',
    'nav.cart': 'Giỏ Vé',
    'nav.support': 'Hỗ Trợ & Khiếu Nại',
    'nav.login': 'Đăng Nhập',
    'nav.register': 'Đăng Ký',
    'nav.logout': 'Đăng Xuất',
    'nav.organizer_studio': 'Bảng Quản Trị Sự Kiện',
    'nav.admin_console': 'Bảng Điều Hành Quản Trị',
    'nav.view_store': 'Xem Trang Bán Vé',
    'nav.notifications': 'Thông Báo Hộp Thư',
    'nav.no_notifications': 'Chưa có thông báo mới nào',
    'nav.notifications_count': 'tin',
    'nav.customer_role': 'Khách hàng',
    'nav.organizer_role': 'Ban Tổ Chức',
    'nav.admin_role': 'Quản Trị Viên Sàn',

    // Role Switcher Top Bar
    'role.title': 'HỆ THỐNG VAI TRÒ',
    'role.workspace': 'Không gian làm việc:',
    'role.attendee': 'Khách Mua Vé',
    'role.attendee_sub': 'Attendee Portal',
    'role.organizer': 'Ban Tổ Chức',
    'role.organizer_sub': 'Organizer Studio',
    'role.admin': 'Quản Trị Sàn',
    'role.admin_sub': 'Executive Admin',
    'role.session': 'Phiên:',
    'role.switching': 'Đang đổi phiên...',
    'role.expand': '▼ Mở rộng',
    'role.collapse': '▲ Thu gọn',

    // Theme & Language Controls
    'theme.toggle_label': 'Giao diện',
    'theme.light': 'Sáng',
    'theme.dark': 'Tối',
    'theme.system': 'Hệ thống',
    'lang.label': 'Ngôn ngữ',
    'lang.vi': 'Tiếng Việt',
    'lang.en': 'English',

    // Common Actions
    'action.search': 'Tìm kiếm',
    'action.filter': 'Bộ lọc',
    'action.apply': 'Áp dụng',
    'action.cancel': 'Hủy',
    'action.confirm': 'Xác nhận',
    'action.save': 'Lưu',
    'action.close': 'Đóng',
    'action.back': 'Quay lại',
    'action.back_home': 'Quay về trang chủ',
    'action.load_more': 'Xem thêm',
    'action.view_details': 'Xem Chi Tiết & Mua Vé',
    'action.print': 'In biên lai / Lưu PDF',
    'action.download': 'Tải tệp về máy',

    // Home Page
    'home.hero_badge': 'Sàn Vé Sự Kiện Trực Tuyến Độc Quyền',
    'home.hero_title': 'Khám Phá & Đặt Vé Sự Kiện Đỉnh Cao',
    'home.hero_sub': 'Giữ chỗ nguyên tử 15 phút · Mỗi người một mã QR độc nhất · Bảo chứng 100% dòng tiền Escrow.',
    'home.search_placeholder': 'Tìm kiếm sự kiện theo tên, nghệ sĩ, địa điểm...',
    'home.all_categories': 'Tất cả thể loại',
    'home.all_provinces': 'Tất cả tỉnh/thành',
    'home.filter_category': 'Thể loại sự kiện:',
    'home.filter_province': 'Địa điểm tỉnh/thành:',
    'home.featured_heading': 'Sự Kiện Nổi Bật',
    'home.featured_sub': 'Các chương trình đại nhạc hội, triển lãm và hội nghị công nghệ thu hút hàng ngàn khán giả.',
    'home.upcoming_heading': 'Sự Kiện Sắp Diễn Ra',
    'home.upcoming_sub': 'Nhanh tay giữ chỗ sớm để nhận ưu đãi Early Bird và vị trí ghế đẹp nhất.',
    'home.all_heading': 'Tất Cả Sự Kiện',
    'home.all_sub': 'Danh sách sự kiện mở bán trực tuyến minh bạch trên nền tảng Ticketflow.',
    'home.vip_passes_heading': 'Thẻ Hội Viên VIP Đặc Quyền',
    'home.vip_passes_sub': 'Đặc quyền ưu tiên giữ chỗ trước 24h, check-in làn VIP riêng và giảm giá trọn năm.',
    'home.verified_stars_heading': 'Ban Tổ Chức & Nghệ Sĩ Xác Thực',
    'home.verified_stars_sub': 'Được bảo chứng 100% dòng tiền Escrow từ sàn Ticketflow.',
    'home.starting_from': 'Từ',
    'home.no_events_found': 'Không tìm thấy sự kiện phù hợp với bộ lọc hiện tại.',
    'home.view_all': 'Xem tất cả',

    // Event Details
    'event.about_title': 'Giới thiệu chi tiết sự kiện',
    'event.agenda_title': 'Lịch trình chi tiết (Agenda)',
    'event.seatmap_title': 'Sơ đồ chỗ ngồi & Khán phòng',
    'event.seatmap_desc': 'Sơ đồ bố trí chỗ ngồi trực quan. Hệ thống sẽ tự động gán vị trí ghế liên tiếp (Contiguous Seating) tối ưu nhất cho bạn khi chọn từ 2 vé trở lên.',
    'event.seatmap_stage': 'SÂN KHẤU CHÍNH (MAIN STAGE)',
    'event.seatmap_legend': 'Ghế màu xám: Ghế VIP / Bảo lưu nội bộ · Ghế màu xanh: Mở bán tự động',
    'event.policy_title': 'Chính sách hủy vé & Hoàn tiền minh bạch',
    'event.policy_self_service': 'Tự phục vụ trực tuyến: Bạn có thể chủ động hủy vé và nhận hoàn tiền trực tiếp tại trang "Vé của tôi" nếu đáp ứng điều kiện hoàn hủy của sự kiện.',
    'event.policy_escrow': 'Bảo vệ dòng tiền Escrow: 100% dòng tiền giao dịch được sàn bảo chứng an toàn, hoàn tiền 100% tức thì nếu sự kiện bị dời lịch hoặc hủy bỏ.',
    'event.sidebar_title': 'Chọn hạng vé & Số lượng',
    'event.hold_15m_badge': 'Giữ chỗ 15 phút',
    'event.no_tiers': 'Hiện chưa có hạng vé nào được mở bán.',
    'event.sold_out': 'Đã hết vé',
    'event.remaining_tickets': 'Còn {n} vé',
    'event.free_ticket': 'MIỄN PHÍ',
    'event.promo_label': 'Mã giảm giá ưu đãi:',
    'event.promo_placeholder': 'Nhập mã (ví dụ: SAVE20)',
    'event.summary_discount': 'Mã giảm giá',
    'event.summary_total': 'Tổng cộng',
    'event.reserve_btn_empty': 'Vui lòng chọn vé',
    'event.reserve_btn_submitting': 'Đang khóa vé & phân bổ ghế...',
    'event.reserve_btn_action': 'Giữ {n} vé trong 15 phút',
    'event.atomic_note': 'Bảo đảm giữ vé: Sau khi nhấn chọn vé, hệ thống sẽ giữ chỗ an toàn cho bạn trong 15 phút để hoàn tất thanh toán.',
    'event.brochure_btn': 'Xem & Tải Brochure / Cẩm nang (PDF)',
    'event.favorite_btn': 'Thả tim & Nhận thông báo mở lại vé',
    'event.favorited_btn': 'Đã thả tim (Đang theo dõi)',
    'event.restock_toast': 'Bạn sẽ nhận thông báo tự động ngay khi có vé nhả lại vào kho (từ các đơn hủy hoặc quá hạn 15 phút)!',

    // Checkout Page
    'checkout.page_title': 'Thanh toán Đơn Hàng & Nhận Vé',
    'checkout.timer_title': 'Vé & Chỗ ngồi đang được giữ độc quyền cho bạn',
    'checkout.timer_desc': 'Chỗ ngồi đã được khóa an toàn. Vui lòng hoàn tất thanh toán trước khi hết giờ.',
    'checkout.buyer_section': '1. Thông tin người đặt vé (Chủ đơn hàng)',
    'checkout.buyer_name': 'Họ và tên *',
    'checkout.buyer_email': 'Email nhận vé & hóa đơn *',
    'checkout.buyer_phone': 'Số điện thoại liên hệ *',
    'checkout.attendee_section': '2. Danh sách người tham dự',
    'checkout.attendee_desc': 'Mỗi vé sẽ được phát hành mã QR và mã vạch độc nhất cho từng người tham dự.',
    'checkout.attendee_seat': 'Ghế',
    'checkout.attendee_name': 'Họ và tên người đi:',
    'checkout.attendee_email': 'Email người đi (để nhận vé riêng):',
    'checkout.payment_section': '3. Phương thức thanh toán trực tuyến (Online-only)',
    'checkout.free_alert': 'Đơn hàng của bạn có tổng trị giá 0 đ (Vé miễn phí). Bạn sẽ nhận vé ngay lập tức mà không cần thanh toán!',
    'checkout.card_title': 'Thẻ Quốc tế (Visa / Master / JCB)',
    'checkout.card_desc': 'Cổng thanh toán bảo mật chuẩn 3D-Secure quốc tế',
    'checkout.vnpay_title': 'Cổng VNPay QR / Ví VNPay',
    'checkout.vnpay_desc': 'Quét mã QR bằng App 30+ Ngân hàng hàng đầu',
    'checkout.momo_title': 'Ví điện tử MoMo',
    'checkout.momo_desc': 'Thanh toán siêu tốc liên kết ví MoMo',
    'checkout.napas_title': 'Chuyển khoản QR Napas 247',
    'checkout.napas_desc': 'Tự động khớp lệnh tức thì 24/7 qua mã QR động',
    'checkout.submit_free': 'Hoàn tất đăng ký vé miễn phí (0 đ) ngay',
    'checkout.submit_pay': 'Thanh toán trực tuyến & Nhận vé ngay',
    'checkout.submit_processing': 'Đang kết nối cổng thanh toán an toàn...',
    'checkout.escrow_note': 'Dòng tiền bảo chứng Escrow: 100% thanh toán được tạm giữ an toàn bởi sàn Ticketflow và chỉ giải ngân cho ban tổ chức sau khi sự kiện kết thúc thành công.',
    'checkout.summary_title': 'Tóm tắt đơn hàng',
    'checkout.subtotal': 'Tạm tính:',
    'checkout.discount': 'Ưu đãi giảm giá:',
    'checkout.total_due': 'Tổng tiền thanh toán:',
    'checkout.security_hold': 'Bảo đảm giữ chỗ 15 phút',
    'checkout.security_contiguous': 'Tự động xếp ghế liền kề',
    'checkout.security_qr': 'QR code độc nhất chống vé trùng',
    'checkout.security_refund': 'Tự phục vụ hoàn tiền theo chính sách',
    'checkout.cancel_hold': 'Hủy giữ chỗ',
    'checkout.empty_title': 'Giỏ vé của bạn đang trống',
    'checkout.empty_desc': 'Bạn chưa chọn vé hoặc phiên giữ chỗ đã hết hạn. Hãy chọn vé tại trang chi tiết sự kiện để giữ chỗ.',
    'checkout.empty_btn': 'Khám phá các sự kiện',

    // Receipt Page
    'receipt.header_badge': 'Biên lai điện tử hợp lệ · Bảo chứng 100% Escrow',
    'receipt.headline': 'Biên Lai Điện Tử / Hóa Đơn Trực Tuyến',
    'receipt.code_label': 'Mã biên lai:',
    'receipt.order_label': 'Mã đơn:',
    'receipt.meta_event': 'SỰ KIỆN',
    'receipt.meta_buyer': 'NGƯỜI MUA VÉ',
    'receipt.meta_payment': 'THANH TOÁN',
    'receipt.table_tier': 'Hạng vé',
    'receipt.table_qty': 'Số lượng',
    'receipt.table_unit_price': 'Đơn giá',
    'receipt.table_amount': 'Thành tiền',
    'receipt.tickets_title': 'Danh sách Vé điện tử & Mã QR Check-in',
    'receipt.scan_hint': 'Quét QR tại cổng',
    'receipt.btn_my_tickets': 'Quản lý trong Vé của tôi',

    // My Tickets Page
    'tickets.badge': 'Vé điện tử của tôi',
    'tickets.page_title': 'Vé & Đơn hàng đã đặt',
    'tickets.page_subtitle': 'Quản lý mã QR vào cổng, vị trí chỗ ngồi, chuyển nhượng vé và tự phục vụ hủy vé/hoàn tiền trực tuyến.',
    'tickets.tab_active': 'Vé Sắp Diễn Ra',
    'tickets.tab_history': 'Lịch Sử & Hoàn Vé',
    'tickets.search_placeholder': 'Tìm theo mã đơn, tên sự kiện, họ tên người đi...',
    'tickets.empty': 'Bạn chưa có đơn đặt vé nào trong mục này.',
    'tickets.btn_view_receipt': 'Xem Biên Lai',
    'tickets.btn_refund': 'Hủy & Hoàn vé',
    'tickets.btn_transfer': 'Chuyển nhượng',
    'tickets.helpdesk_heading': 'Trung Tâm Trợ Giúp & Giải Quyết Khiếu Nại',
    'tickets.helpdesk_sub': 'Tra cứu nhanh câu hỏi thường gặp hoặc gửi phiếu hỗ trợ trực tiếp đến Ban tổ chức và Ban quản trị sàn Ticketflow.',
    'tickets.btn_send_support': 'Gửi Yêu Cầu Hỗ Trợ',

    // Auth Pages
    'auth.login_title': 'Đăng Nhập Tài Khoản',
    'auth.login_sub': 'Đăng nhập để xem vé, quản lý sự kiện hoặc cài đặt tài khoản',
    'auth.register_title': 'Tạo Tài Khoản Khách Mua Vé',
    'auth.register_sub': 'Đăng ký tài khoản để bắt đầu khám phá và đặt vé sự kiện',
    'auth.email': 'Địa Chỉ Email',
    'auth.password': 'Mật Khẩu',
    'auth.name': 'Họ và Tên *',
    'auth.btn_login': 'Đăng Nhập',
    'auth.btn_logging_in': 'Đang Đăng Nhập...',
    'auth.btn_register': 'Hoàn Tất Đăng Ký',
    'auth.btn_registering': 'Đang Tạo Tài Khoản...',
    'auth.quick_demo': 'Chọn nhanh tài khoản trải nghiệm:',
    'auth.switch_to_register': 'Chưa có tài khoản? Đăng ký tài khoản mới',
    'auth.switch_to_login': 'Đã có tài khoản? Đăng nhập',
    'auth.password_min': 'Tối thiểu 8 ký tự',
  },

  en: {
    // Navigation & Common Layouts
    'nav.explore': 'Explore Events',
    'nav.my_tickets': 'My Tickets',
    'nav.cart': 'Ticket Cart',
    'nav.support': 'Help & Support',
    'nav.login': 'Sign In',
    'nav.register': 'Sign Up',
    'nav.logout': 'Sign Out',
    'nav.organizer_studio': 'Organizer Studio',
    'nav.admin_console': 'Admin Console',
    'nav.view_store': 'View Store',
    'nav.notifications': 'Notifications Inbox',
    'nav.no_notifications': 'No new notifications',
    'nav.notifications_count': 'items',
    'nav.customer_role': 'Attendee',
    'nav.organizer_role': 'Organizer',
    'nav.admin_role': 'Platform Admin',

    // Role Switcher Top Bar
    'role.title': 'ROLE SELECTOR',
    'role.workspace': 'Active Workspace:',
    'role.attendee': 'Attendee',
    'role.attendee_sub': 'Attendee Portal',
    'role.organizer': 'Organizer',
    'role.organizer_sub': 'Organizer Studio',
    'role.admin': 'Platform Admin',
    'role.admin_sub': 'Executive Admin',
    'role.session': 'Session:',
    'role.switching': 'Switching role...',
    'role.expand': '▼ Expand',
    'role.collapse': '▲ Collapse',

    // Theme & Language Controls
    'theme.toggle_label': 'Theme',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.system': 'System',
    'lang.label': 'Language',
    'lang.vi': 'Tiếng Việt',
    'lang.en': 'English',

    // Common Actions
    'action.search': 'Search',
    'action.filter': 'Filter',
    'action.apply': 'Apply',
    'action.cancel': 'Cancel',
    'action.confirm': 'Confirm',
    'action.save': 'Save',
    'action.close': 'Close',
    'action.back': 'Back',
    'action.back_home': 'Back to Home',
    'action.load_more': 'Load More',
    'action.view_details': 'View Details & Book Tickets',
    'action.print': 'Print Receipt / Save PDF',
    'action.download': 'Download File',

    // Home Page
    'home.hero_badge': 'Premier Online Event Ticketing Platform',
    'home.hero_title': 'Discover & Book Exceptional Live Events',
    'home.hero_sub': '15-minute atomic holds · Unique QR code per attendee · 100% Escrow-backed fund security.',
    'home.search_placeholder': 'Search events by title, artist, venue...',
    'home.all_categories': 'All Categories',
    'home.all_provinces': 'All Provinces',
    'home.filter_category': 'Event Category:',
    'home.filter_province': 'Location/Province:',
    'home.featured_heading': 'Featured Events',
    'home.featured_sub': 'Major concerts, cultural festivals, and tech conferences attracting thousands of attendees.',
    'home.upcoming_heading': 'Upcoming Events',
    'home.upcoming_sub': 'Reserve early to lock in exclusive Early Bird rates and premier seating.',
    'home.all_heading': 'All Events',
    'home.all_sub': 'Complete public catalog with transparent availability on Ticketflow.',
    'home.vip_passes_heading': 'Exclusive VIP Membership Passes',
    'home.vip_passes_sub': '24h advance reservation priority, dedicated fast-track VIP entrance, and year-round discounts.',
    'home.verified_stars_heading': 'Verified Organizers & Labels',
    'home.verified_stars_sub': 'Fully backed by Ticketflow 100% Escrow protection.',
    'home.starting_from': 'From',
    'home.no_events_found': 'No events match the selected criteria.',
    'home.view_all': 'View All',

    // Event Details
    'event.about_title': 'About this event',
    'event.agenda_title': 'Event Agenda & Schedule',
    'event.seatmap_title': 'Seating Plan & Auditorium Map',
    'event.seatmap_desc': 'Interactive hall overview. Our contiguous seating algorithm automatically allocates consecutive seats when purchasing 2 or more tickets.',
    'event.seatmap_stage': 'MAIN STAGE',
    'event.seatmap_legend': 'Gray seats: VIP / Reserved · Blue seats: Open for booking',
    'event.policy_title': 'Cancellation & Transparent Refund Policy',
    'event.policy_self_service': 'Self-service online: You can cancel and claim refunds directly from "My Tickets" when meeting the organizer refund window.',
    'event.policy_escrow': 'Escrow Security: 100% of transaction funds are safely held in Escrow and refunded instantly if an event is cancelled or postponed.',
    'event.sidebar_title': 'Select Ticket Tiers & Quantity',
    'event.hold_15m_badge': '15m Reservation Hold',
    'event.no_tiers': 'No ticket tiers currently available for purchase.',
    'event.sold_out': 'Sold Out',
    'event.remaining_tickets': '{n} tickets remaining',
    'event.free_ticket': 'FREE',
    'event.promo_label': 'Promotional discount code:',
    'event.promo_placeholder': 'Enter code (e.g. SAVE20)',
    'event.summary_discount': 'Discount Promo',
    'event.summary_total': 'Total',
    'event.reserve_btn_empty': 'Please select tickets',
    'event.reserve_btn_submitting': 'Holding tickets & assigning seats...',
    'event.reserve_btn_action': 'Hold {n} tickets for 15 minutes',
    'event.atomic_note': 'Atomic Hold Guarantee: Once reserved, tickets and seats are exclusively locked for 15 minutes to finish checkout.',
    'event.brochure_btn': 'View & Download Brochure (PDF)',
    'event.favorite_btn': 'Favorite & Get Restock Alerts',
    'event.favorited_btn': 'Following (Favorited)',
    'event.restock_toast': 'You will receive immediate alerts whenever tickets are released back to stock!',

    // Checkout Page
    'checkout.page_title': 'Order Checkout & Payment',
    'checkout.timer_title': 'Tickets & Seats are Exclusively Held for You',
    'checkout.timer_desc': 'Seats are safely held. Please complete checkout before the countdown expires.',
    'checkout.buyer_section': '1. Buyer Information (Order Owner)',
    'checkout.buyer_name': 'Full Name *',
    'checkout.buyer_email': 'Delivery & Invoice Email *',
    'checkout.buyer_phone': 'Contact Phone *',
    'checkout.attendee_section': '2. Attendee Details',
    'checkout.attendee_desc': 'Each attendee receives a distinct QR code and entry barcode.',
    'checkout.attendee_seat': 'Seat',
    'checkout.attendee_name': 'Attendee Full Name:',
    'checkout.attendee_email': 'Attendee Email (for personal ticket):',
    'checkout.payment_section': '3. Instant Online Payment Methods',
    'checkout.free_alert': 'Your order total is $0 (Free Pass). Complete checkout instantly without payment!',
    'checkout.card_title': 'Credit/Debit Card (Visa / Master / JCB)',
    'checkout.card_desc': 'Global secure payment gateway with 3D-Secure protection',
    'checkout.vnpay_title': 'VNPay QR / Wallet Gateway',
    'checkout.vnpay_desc': 'Scan QR with 30+ top mobile banking apps',
    'checkout.momo_title': 'MoMo E-Wallet',
    'checkout.momo_desc': 'Instant high-speed mobile payment with MoMo',
    'checkout.napas_title': 'Napas 247 Dynamic QR Transfer',
    'checkout.napas_desc': 'Real-time 24/7 bank transfer with instant reconciliation',
    'checkout.submit_free': 'Complete Instant Free Registration (0 ₫) Now',
    'checkout.submit_pay': 'Pay Online & Issue Tickets Now',
    'checkout.submit_processing': 'Connecting to secure payment gateway...',
    'checkout.escrow_note': '100% Escrow Protection: Funds are safely held in trust by Ticketflow and only disbursed to the organizer after successful event conclusion.',
    'checkout.summary_title': 'Order Summary',
    'checkout.subtotal': 'Subtotal:',
    'checkout.discount': 'Discount:',
    'checkout.total_due': 'Total Amount Due:',
    'checkout.security_hold': '15-minute guaranteed hold',
    'checkout.security_contiguous': 'Automatic adjacent seat allocation',
    'checkout.security_qr': 'Unique fraud-proof QR code per ticket',
    'checkout.security_refund': 'Policy-driven online self-refund',
    'checkout.cancel_hold': 'Cancel Hold',
    'checkout.empty_title': 'Your ticket cart is empty',
    'checkout.empty_desc': 'You have not reserved any tickets or your session expired. Browse events to pick your seats.',
    'checkout.empty_btn': 'Explore Events',

    // Receipt Page
    'receipt.header_badge': 'Official Digital Receipt · 100% Escrow Guaranteed',
    'receipt.headline': 'Digital Receipt & Online Invoice',
    'receipt.code_label': 'Receipt ID:',
    'receipt.order_label': 'Order ID:',
    'receipt.meta_event': 'EVENT',
    'receipt.meta_buyer': 'BUYER',
    'receipt.meta_payment': 'PAYMENT',
    'receipt.table_tier': 'Ticket Tier',
    'receipt.table_qty': 'Quantity',
    'receipt.table_unit_price': 'Unit Price',
    'receipt.table_amount': 'Amount',
    'receipt.tickets_title': 'Issued Digital Tickets & Check-in QR Codes',
    'receipt.scan_hint': 'Scan QR at venue gate',
    'receipt.btn_my_tickets': 'Manage in My Tickets',

    // My Tickets Page
    'tickets.badge': 'My E-Tickets',
    'tickets.page_title': 'My Tickets & Order History',
    'tickets.page_subtitle': 'Manage your check-in QR codes, seat assignments, ticket transfers, and self-service online refunds.',
    'tickets.tab_active': 'Active Tickets',
    'tickets.tab_history': 'History & Refunds',
    'tickets.search_placeholder': 'Search by order code, event title, attendee name...',
    'tickets.empty': 'You have no tickets in this section.',
    'tickets.btn_view_receipt': 'View Receipt',
    'tickets.btn_refund': 'Cancel & Refund',
    'tickets.btn_transfer': 'Transfer',
    'tickets.helpdesk_heading': 'Helpdesk & Dispute Resolution Center',
    'tickets.helpdesk_sub': 'Check FAQs or submit a ticket directly to event organizers and Ticketflow platform administrators.',
    'tickets.btn_send_support': 'Submit Support Request',

    // Auth Pages
    'auth.login_title': 'Sign In to Account',
    'auth.login_sub': 'Sign in to access your tickets, manage events, or change settings',
    'auth.register_title': 'Create Attendee Account',
    'auth.register_sub': 'Sign up to discover and book live events seamlessly',
    'auth.email': 'Email Address',
    'auth.password': 'Password',
    'auth.name': 'Full Name *',
    'auth.btn_login': 'Sign In',
    'auth.btn_logging_in': 'Signing In...',
    'auth.btn_register': 'Complete Registration',
    'auth.btn_registering': 'Creating Account...',
    'auth.quick_demo': 'Quick Demo Account Switcher:',
    'auth.switch_to_register': "Don't have an account? Sign up",
    'auth.switch_to_login': 'Already have an account? Sign in',
    'auth.password_min': 'Minimum 8 characters',
  },
};

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem('tf_lang') || 'vi';
    } catch {
      return 'vi';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tf_lang', lang);
      document.documentElement.lang = lang;
    } catch {}
  }, [lang]);

  const setLang = (newLang) => {
    if (newLang === 'vi' || newLang === 'en') {
      setLangState(newLang);
    }
  };

  const toggleLang = () => {
    setLangState((prev) => (prev === 'vi' ? 'en' : 'vi'));
  };

  const t = (key, fallback = '') => {
    const dict = DICTIONARY[lang] || DICTIONARY['vi'];
    if (dict && dict[key] !== undefined) {
      return dict[key];
    }
    // Fallback to Vietnamese if available
    if (DICTIONARY['vi'] && DICTIONARY['vi'][key] !== undefined) {
      return DICTIONARY['vi'][key];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t, isEn: lang === 'en', isVi: lang === 'vi' }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      lang: 'vi',
      setLang: () => {},
      toggleLang: () => {},
      t: (key, fallback) => fallback || key,
      isEn: false,
      isVi: true,
    };
  }
  return ctx;
};

export default LanguageContext;
