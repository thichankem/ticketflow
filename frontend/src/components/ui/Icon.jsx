import React from 'react';
import {
  HomeIcon,
  CompassIcon,
  CalendarIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  MenuIcon,
  CloseIcon,
  UserIcon,
  SettingsIcon,
  LogoutIcon,
  DashboardIcon,
} from './icons/navigation';

import {
  SearchIcon,
  FilterIcon,
  SortIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  SaveIcon,
  RefreshIcon,
  DownloadIcon,
  UploadCloudIcon,
  ImageIcon,
  ShareIcon,
  SendIcon,
  EyeIcon,
  EyeOffIcon,
  HeartIcon,
  PrinterIcon,
  ExternalLinkIcon,
  CopyIcon,
  MoreOptionsIcon,
  CameraIcon,
} from './icons/actions';

import {
  TicketIcon,
  TicketCheckIcon,
  TicketTransferIcon,
  ShoppingCartIcon,
  CreditCardIcon,
  ReceiptIcon,
  RefundIcon,
  DollarSignIcon,
  PercentIcon,
  TagIcon,
  CrownIcon,
  SparklesIcon,
  ZapIcon,
  FileTextIcon,
} from './icons/commerce';

import {
  MapPinIcon,
  MapIcon,
  UsersIcon,
  MusicIcon,
  PaletteIcon,
  CpuIcon,
  BriefcaseIcon,
  TrophyIcon,
  StoreIcon,
  BuildingIcon,
  RadioIcon,
} from './icons/events';

import {
  CheckIcon,
  CheckCircleIcon,
  CheckCheckIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  InfoIcon,
  ShieldIcon,
  LockIcon,
  UnlockIcon,
  HourglassIcon,
  CircleIcon,
  BellIcon,
  QrCodeIcon,
  ChartIcon,
  TrendingUpIcon,
  TableIcon,
  LayersIcon,
  MailIcon,
  PhoneIcon,
  HelpCircleIcon,
} from './icons/status';

/**
 * Standard Sizing Scale Tokens (WCAG & Optical Hierarchy)
 */
export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  '2xl': 48,
};

/**
 * TicketFlow 100% Original Handcrafted SVG Icon Registry
 * Zero external icon libraries, zero third-party path definitions.
 */
const ICON_REGISTRY = {
  // Navigation & Spatial
  home: HomeIcon,
  compass: CompassIcon,
  explore: CompassIcon,
  calendar: CalendarIcon,
  events: CalendarIcon,
  clock: ClockIcon,
  time: ClockIcon,
  'chevron-down': ChevronDownIcon,
  'chevron-up': ChevronUpIcon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  'arrow-right': ArrowRightIcon,
  'arrow-left': ArrowLeftIcon,
  menu: MenuIcon,
  close: CloseIcon,
  x: CloseIcon,
  user: UserIcon,
  profile: UserIcon,
  settings: SettingsIcon,
  logout: LogoutIcon,
  'log-out': LogoutIcon,
  dashboard: DashboardIcon,
  studio: DashboardIcon,

  // Actions
  search: SearchIcon,
  filter: FilterIcon,
  sort: SortIcon,
  plus: PlusIcon,
  add: PlusIcon,
  edit: EditIcon,
  'edit-3': EditIcon,
  trash: TrashIcon,
  'trash-2': TrashIcon,
  delete: TrashIcon,
  save: SaveIcon,
  refresh: RefreshIcon,
  sync: RefreshIcon,
  'refresh-cw': RefreshIcon,
  download: DownloadIcon,
  export: DownloadIcon,
  upload: UploadCloudIcon,
  'upload-cloud': UploadCloudIcon,
  image: ImageIcon,
  share: ShareIcon,
  send: SendIcon,
  eye: EyeIcon,
  'eye-off': EyeOffIcon,
  heart: HeartIcon,
  printer: PrinterIcon,
  print: PrinterIcon,
  'external-link': ExternalLinkIcon,
  copy: CopyIcon,
  more: MoreOptionsIcon,
  'more-options': MoreOptionsIcon,
  camera: CameraIcon,

  // Commerce & Ticketing
  ticket: TicketIcon,
  tickets: TicketIcon,
  'ticket-check': TicketCheckIcon,
  checkin: TicketCheckIcon,
  'ticket-transfer': TicketTransferIcon,
  transfer: TicketTransferIcon,
  cart: ShoppingCartIcon,
  shoppingcart: ShoppingCartIcon,
  'shopping-cart': ShoppingCartIcon,
  wallet: CreditCardIcon,
  payment: CreditCardIcon,
  'credit-card': CreditCardIcon,
  receipt: ReceiptIcon,
  refund: RefundIcon,
  dollar: DollarSignIcon,
  revenue: DollarSignIcon,
  percent: PercentIcon,
  discount: PercentIcon,
  commission: PercentIcon,
  tag: TagIcon,
  promo: TagIcon,
  crown: CrownIcon,
  vip: CrownIcon,
  sparkles: SparklesIcon,
  feature: SparklesIcon,
  zap: ZapIcon,
  'file-text': FileTextIcon,
  report: FileTextIcon,

  // Domain & Event Concepts
  location: MapPinIcon,
  'map-pin': MapPinIcon,
  pin: MapPinIcon,
  map: MapIcon,
  users: UsersIcon,
  attendees: UsersIcon,
  music: MusicIcon,
  palette: PaletteIcon,
  art: PaletteIcon,
  design: PaletteIcon,
  cpu: CpuIcon,
  tech: CpuIcon,
  technology: CpuIcon,
  briefcase: BriefcaseIcon,
  business: BriefcaseIcon,
  trophy: TrophyIcon,
  sports: TrophyIcon,
  community: CompassIcon,
  store: StoreIcon,
  organizer: StoreIcon,
  building: BuildingIcon,
  radio: RadioIcon,
  announcements: RadioIcon,

  // Status, Security & Analytics
  check: CheckIcon,
  'check-circle': CheckCircleIcon,
  'check-check': CheckCheckIcon,
  alert: AlertTriangleIcon,
  warning: AlertTriangleIcon,
  'alert-triangle': AlertTriangleIcon,
  'alert-circle': AlertCircleIcon,
  error: AlertCircleIcon,
  info: InfoIcon,
  lightbulb: InfoIcon,
  shield: ShieldIcon,
  admin: ShieldIcon,
  lock: LockIcon,
  unlock: UnlockIcon,
  hourglass: HourglassIcon,
  pending: HourglassIcon,
  circle: CircleIcon,
  bell: BellIcon,
  notification: BellIcon,
  notifications: BellIcon,
  qr: QrCodeIcon,
  'qr-code': QrCodeIcon,
  chart: ChartIcon,
  'bar-chart': ChartIcon,
  'trending-up': TrendingUpIcon,
  table: TableIcon,
  layers: LayersIcon,
  mail: MailIcon,
  phone: PhoneIcon,
  help: HelpCircleIcon,
  'help-circle': HelpCircleIcon,
  question: HelpCircleIcon,
};

/**
 * 100% Original Handcrafted SVG Icon Engine
 * Renders declarative vector geometry with accessible labeling, scale tokens and CSS currentColor inheritance.
 */
export const Icon = ({
  name,
  size = 'md',
  className = '',
  color = 'currentColor',
  strokeWidth = 2,
  fill = 'none',
  ariaLabel,
  ariaHidden,
  style,
  ...rest
}) => {
  if (!name) return null;

  const key = String(name).toLowerCase().replace(/_/g, '-').trim();
  const IconGeometry = ICON_REGISTRY[key] || ICON_REGISTRY[key.replace(/\s+/g, '-')] || HelpCircleIcon;

  const pixelSize = typeof size === 'number' ? size : ICON_SIZES[size] || 20;
  const isAriaHidden = ariaHidden !== undefined ? ariaHidden : !ariaLabel;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={pixelSize}
      height={pixelSize}
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`tf-vector-icon ${className}`}
      aria-hidden={isAriaHidden}
      aria-label={ariaLabel}
      role={isAriaHidden ? 'presentation' : 'img'}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    >
      <IconGeometry />
    </svg>
  );
};

export default Icon;
