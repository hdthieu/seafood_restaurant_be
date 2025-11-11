--
-- PostgreSQL database dump
--

\restrict 6x8xEJV3UdLfSIu2k8caV6sQQy4g6ieIdaTRgLZ9WNgd3w2Fuqm6wg8mgvb1P4N

-- Dumped from database version 17.6 (Debian 17.6-2.pgdg13+1)
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: test; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA test;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: areas_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.areas_status_enum AS ENUM (
    'AVAILABLE',
    'UNAVAILABLE',
    'MAINTENANCE',
    'FULL'
);


--
-- Name: attendances_checktype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendances_checktype_enum AS ENUM (
    'IN',
    'OUT'
);


--
-- Name: attendances_method_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendances_method_enum AS ENUM (
    'MANUAL',
    'SELF'
);


--
-- Name: attendances_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendances_status_enum AS ENUM (
    'ON_TIME',
    'LATE',
    'MISSING',
    'ABSENT',
    'LEAVE'
);


--
-- Name: attendances_verify_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendances_verify_enum AS ENUM (
    'PASS',
    'FAIL_GPS',
    'FAIL_WIFI',
    'FAIL_RULE'
);


--
-- Name: cashbook_entries_counterparty_group_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cashbook_entries_counterparty_group_enum AS ENUM (
    'CUSTOMER',
    'SUPPLIER',
    'STAFF',
    'DELIVERY_PARTNER',
    'OTHER'
);


--
-- Name: cashbook_entries_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cashbook_entries_type_enum AS ENUM (
    'RECEIPT',
    'PAYMENT'
);


--
-- Name: categories_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.categories_type_enum AS ENUM (
    'MENU',
    'INGREDIENT'
);


--
-- Name: customers_gender_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.customers_gender_enum AS ENUM (
    'MALE',
    'FEMALE',
    'OTHER'
);


--
-- Name: customers_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.customers_type_enum AS ENUM (
    'PERSONAL',
    'COMPANY'
);


--
-- Name: inventory_transactions_action_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_transactions_action_enum AS ENUM (
    'IMPORT',
    'EXPORT',
    'ADJUST',
    'WASTE',
    'IN',
    'OUT'
);


--
-- Name: invoice_promotions_applywith_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_promotions_applywith_enum AS ENUM (
    'ORDER',
    'CATEGORY',
    'ITEM'
);


--
-- Name: invoices_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoices_status_enum AS ENUM (
    'UNPAID',
    'PARTIAL',
    'PAID'
);


--
-- Name: kitchen_tickets_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.kitchen_tickets_status_enum AS ENUM (
    'PENDING',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'SERVED',
    'CANCELLED'
);


--
-- Name: order_items_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_items_status_enum AS ENUM (
    'PENDING',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'SERVED',
    'CANCELLED'
);


--
-- Name: order_status_history_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status_history_status_enum AS ENUM (
    'PENDING',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'SERVED',
    'PAID',
    'CANCELLED',
    'MERGED'
);


--
-- Name: orders_ordertype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.orders_ordertype_enum AS ENUM (
    'DINE_IN',
    'TAKE_AWAY'
);


--
-- Name: orders_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.orders_status_enum AS ENUM (
    'PENDING',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'SERVED',
    'PAID',
    'CANCELLED',
    'MERGED'
);


--
-- Name: promotions_applywith_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.promotions_applywith_enum AS ENUM (
    'ORDER',
    'CATEGORY',
    'ITEM'
);


--
-- Name: promotions_discounttypepromotion_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.promotions_discounttypepromotion_enum AS ENUM (
    'PERCENT',
    'AMOUNT'
);


--
-- Name: purchase_receipt_items_discounttype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_receipt_items_discounttype_enum AS ENUM (
    'AMOUNT',
    'PERCENT'
);


--
-- Name: purchase_receipts_globaldiscounttype_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_receipts_globaldiscounttype_enum AS ENUM (
    'AMOUNT',
    'PERCENT'
);


--
-- Name: purchase_receipts_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_receipts_status_enum AS ENUM (
    'DRAFT',
    'POSTED',
    'PAID',
    'CANCELLED',
    'OWING'
);


--
-- Name: purchase_return_logs_mode_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_return_logs_mode_enum AS ENUM (
    'BY_RECEIPT',
    'STANDALONE'
);


--
-- Name: purchase_returns_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_returns_status_enum AS ENUM (
    'DRAFT',
    'POSTED',
    'REFUNDED',
    'CANCELLED'
);


--
-- Name: supplier_groups_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.supplier_groups_status_enum AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: suppliers_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.suppliers_status_enum AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: tables_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tables_status_enum AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: units_of_measure_dimension_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.units_of_measure_dimension_enum AS ENUM (
    'mass',
    'volume',
    'count',
    'length'
);


--
-- Name: users_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.users_role_enum AS ENUM (
    'MANAGER',
    'CASHIER',
    'WAITER',
    'KITCHEN'
);


--
-- Name: vouchers_kind_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vouchers_kind_enum AS ENUM (
    'RECEIPT',
    'PAYMENT'
);


--
-- Name: vouchers_postingstate_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vouchers_postingstate_enum AS ENUM (
    'DRAFT',
    'POSTED',
    'CANCELLED'
);


--
-- Name: vouchers_source_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vouchers_source_enum AS ENUM (
    'CASH',
    'BANK'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    note character varying,
    status public.areas_status_enum DEFAULT 'AVAILABLE'::public.areas_status_enum NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attendances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendances (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "userId" uuid NOT NULL,
    "dateISO" character varying(10) NOT NULL,
    "shiftId" uuid NOT NULL,
    "checkIn" character varying(5),
    "checkOut" character varying(5),
    status public.attendances_status_enum DEFAULT 'MISSING'::public.attendances_status_enum NOT NULL,
    method public.attendances_method_enum DEFAULT 'MANUAL'::public.attendances_method_enum NOT NULL,
    note text,
    "createdBy" uuid,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "checkType" public.attendances_checktype_enum,
    verify public.attendances_verify_enum,
    lat double precision,
    lng double precision,
    accuracy integer,
    "clientTs" bigint,
    "netType" character varying(16),
    ssid character varying(64),
    bssid character varying(64),
    "clientIp" character varying(64)
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(160) NOT NULL,
    code character varying(50) NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cash_other_parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_other_parties (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(50),
    address character varying(255),
    ward character varying(100),
    district character varying(100),
    province character varying(100),
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cash_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_types (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    description character varying,
    "isIncomeType" boolean DEFAULT true NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cashbook_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashbook_entries (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    type public.cashbook_entries_type_enum NOT NULL,
    code character varying NOT NULL,
    date timestamp without time zone NOT NULL,
    amount numeric(14,2) NOT NULL,
    "isPostedToBusinessResult" boolean DEFAULT true NOT NULL,
    counterparty_group public.cashbook_entries_counterparty_group_enum NOT NULL,
    source_code character varying,
    cash_type_id uuid,
    customer_id uuid,
    supplier_id uuid,
    cash_other_party_id uuid,
    invoice_id uuid,
    purchase_receipt_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_fead56af470343aec8c5e8c5c5" CHECK (((((invoice_id IS NOT NULL))::integer + ((purchase_receipt_id IS NOT NULL))::integer) <= 1))
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    description character varying,
    type public.categories_type_enum DEFAULT 'MENU'::public.categories_type_enum NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(32),
    name character varying(180) NOT NULL,
    phone character varying(20),
    email character varying(180),
    birthday date,
    address text,
    "isWalkin" boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type public.customers_type_enum NOT NULL,
    "companyName" character varying(180),
    province character varying(128),
    district character varying(128),
    ward character varying(128),
    "taxNo" character varying(32),
    "identityNo" character varying(32),
    gender public.customers_gender_enum,
    "visitCount" integer DEFAULT 0 NOT NULL,
    "firstVisitedAt" timestamp with time zone,
    "lastVisitedAt" timestamp with time zone,
    "pointsBalance" integer DEFAULT 0 NOT NULL
);


--
-- Name: geo_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geo_rules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "centerLat" double precision NOT NULL,
    "centerLng" double precision NOT NULL,
    "radiusMeter" integer DEFAULT 150 NOT NULL,
    "wifiCidrs" text[] DEFAULT '{}'::text[] NOT NULL,
    "wifiSsids" text[] DEFAULT '{}'::text[] NOT NULL,
    "requireWifiWhenOnWifi" boolean DEFAULT true NOT NULL,
    "requireGps" boolean DEFAULT true NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredients (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    quantity numeric(12,3) NOT NULL,
    "menuItemId" uuid,
    "inventoryItemId" uuid,
    note text,
    CONSTRAINT "CHK_411383a72d6b72778d813b966d" CHECK ((quantity > (0)::numeric))
);


--
-- Name: inventory_item_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_item_suppliers (
    "inventoryItemsId" uuid NOT NULL,
    "suppliersId" uuid NOT NULL
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying,
    quantity numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    "alertThreshold" numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    category_id uuid,
    code character varying DEFAULT 'DEFAULT_CODE'::character varying,
    "avgCost" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    description text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    base_uom_code character varying(32) NOT NULL,
    CONSTRAINT "CHK_275efe377e2a202c783a588bb0" CHECK ((quantity >= (0)::numeric))
);


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    quantity numeric(12,3) NOT NULL,
    action public.inventory_transactions_action_enum NOT NULL,
    "beforeQty" numeric(12,3),
    "afterQty" numeric(12,3),
    "refType" character varying(50),
    note text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    item_id uuid NOT NULL,
    performed_by_id uuid,
    "unitCost" numeric(12,2),
    "lineCost" numeric(14,2),
    "refId" uuid,
    CONSTRAINT "CHK_9c6474744ac5f68fd383c649b0" CHECK ((quantity > (0)::numeric))
);


--
-- Name: invoice_promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_promotions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "applyWith" public.invoice_promotions_applywith_enum NOT NULL,
    "calculationBase" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "discountAmount" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "giftsCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    invoice_id uuid,
    promotion_id uuid,
    "codeUsed" character varying(32),
    "audienceMatched" jsonb,
    CONSTRAINT "CHK_12df8613778d48bb8d802036cd" CHECK (("discountAmount" >= (0)::numeric)),
    CONSTRAINT "CHK_b410f777b6d1344fcf745010d4" CHECK (("calculationBase" >= (0)::numeric))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    invoice_number character varying NOT NULL,
    order_id uuid,
    total_amount numeric(12,2) NOT NULL,
    status public.invoices_status_enum DEFAULT 'UNPAID'::public.invoices_status_enum NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    guest_count integer,
    customer_id uuid,
    discount_total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    final_amount numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    cashier_id uuid
);


--
-- Name: kitchen_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kitchen_batches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "tableName" character varying(128) NOT NULL,
    staff character varying(128) NOT NULL,
    priority boolean DEFAULT false NOT NULL,
    note text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderId" uuid
);


--
-- Name: kitchen_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kitchen_tickets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    qty integer NOT NULL,
    status public.kitchen_tickets_status_enum DEFAULT 'PENDING'::public.kitchen_tickets_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "batchId" uuid,
    "orderId" uuid,
    "menuItemId" uuid,
    order_item_id uuid,
    "cancelReason" character varying(255),
    "cancelledAt" timestamp with time zone,
    "cancelledBy" character varying(120),
    cancelled boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone,
    CONSTRAINT "CHK_baad66faf4de1da767f8eae4d1" CHECK ((qty > 0))
);


--
-- Name: menu_combo_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_combo_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    quantity numeric(12,3) DEFAULT '1'::numeric NOT NULL,
    note text,
    combo_id uuid,
    item_id uuid
);


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    price numeric(12,2) NOT NULL,
    description character varying,
    image character varying,
    "isAvailable" boolean DEFAULT true NOT NULL,
    "categoryId" uuid,
    "isCombo" boolean DEFAULT false NOT NULL
);


--
-- Name: net_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.net_rules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "branchId" uuid,
    label character varying(128),
    ssid character varying(64),
    bssid character varying(32),
    cidr character varying(43),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    quantity integer NOT NULL,
    price numeric(12,2) NOT NULL,
    "isCooked" boolean DEFAULT false NOT NULL,
    "orderId" uuid,
    "menuItemId" uuid,
    status public.order_items_status_enum DEFAULT 'PENDING'::public.order_items_status_enum NOT NULL,
    "batchId" character varying(64),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    cancelled_by character varying(120),
    deleted_at timestamp without time zone,
    CONSTRAINT "CHK_6e5d794f7711186091b3156024" CHECK ((quantity > 0))
);


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    status public.order_status_history_status_enum NOT NULL,
    "changedAt" timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying,
    "orderId" uuid,
    "updatedById" uuid
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    status public.orders_status_enum DEFAULT 'PENDING'::public.orders_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderType" public.orders_ordertype_enum DEFAULT 'DINE_IN'::public.orders_ordertype_enum NOT NULL,
    "createdById" uuid,
    "tableId" uuid,
    merged_into_id uuid
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "invoiceId" uuid NOT NULL,
    amount bigint NOT NULL,
    method character varying(20) NOT NULL,
    "txnRef" character varying(64),
    status character varying(16) DEFAULT 'PENDING'::character varying NOT NULL,
    "bankCode" character varying(32),
    "cardType" character varying(32),
    "transactionNo" character varying(64),
    "responseCode" character varying(16),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "expireAt" character varying(14),
    "externalTxnId" character varying,
    note text
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    full_name character varying(150) NOT NULL,
    dob timestamp with time zone,
    avatar character varying(250),
    description character varying(500),
    address character varying(250),
    city character varying,
    country character varying DEFAULT 'VietNam'::character varying NOT NULL,
    "addressList" text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying,
    updated_by character varying,
    user_id uuid
);


--
-- Name: promotion_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_categories (
    promotion_id uuid NOT NULL,
    category_id uuid NOT NULL
);


--
-- Name: promotion_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_items (
    promotion_id uuid NOT NULL,
    item_id uuid NOT NULL
);


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(128) NOT NULL,
    "discountTypePromotion" public.promotions_discounttypepromotion_enum NOT NULL,
    "discountValue" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "maxDiscountAmount" numeric(12,2),
    "minOrderAmount" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "startAt" timestamp with time zone NOT NULL,
    "endAt" timestamp with time zone,
    "applyWith" public.promotions_applywith_enum NOT NULL,
    "isActive" boolean DEFAULT false NOT NULL,
    stackable boolean DEFAULT false NOT NULL,
    description text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "audienceRules" jsonb,
    "promotionCode" character varying(32) NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "CHK_795d07496f1fb8fb524e098048" CHECK (("minOrderAmount" >= (0)::numeric)),
    CONSTRAINT "CHK_f9ff3bfca966b7a29220c62280" CHECK (("discountValue" >= (0)::numeric))
);


--
-- Name: purchase_receipt_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_receipt_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    quantity numeric(12,3) NOT NULL,
    "unitPrice" numeric(12,2) NOT NULL,
    note text,
    receipt_id uuid,
    item_id uuid NOT NULL,
    "conversionToBase" numeric(12,6) DEFAULT '1'::numeric NOT NULL,
    "discountType" public.purchase_receipt_items_discounttype_enum DEFAULT 'AMOUNT'::public.purchase_receipt_items_discounttype_enum NOT NULL,
    "discountValue" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "lotNumber" character varying,
    "expiryDate" date,
    "lineNo" integer DEFAULT 1 NOT NULL,
    received_uom_code character varying(32),
    "returnedQuantity" numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    CONSTRAINT "CHK_07a3526d448b6246a183171a88" CHECK ((("discountType" <> 'PERCENT'::public.purchase_receipt_items_discounttype_enum) OR (("discountValue" >= (0)::numeric) AND ("discountValue" <= (100)::numeric)))),
    CONSTRAINT "CHK_28a10bd33251c656114d7667e4" CHECK (("lineNo" >= 1)),
    CONSTRAINT "CHK_550fbd4d2cea04c6dffd96af07" CHECK ((quantity > (0)::numeric)),
    CONSTRAINT "CHK_782ca2d9e54c086cf134534e0d" CHECK (("unitPrice" >= (0)::numeric)),
    CONSTRAINT "CHK_8b105af7268ef26c14f8bc31ca" CHECK (("conversionToBase" > (0)::numeric))
);


--
-- Name: purchase_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_receipts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying NOT NULL,
    "receiptDate" date NOT NULL,
    status public.purchase_receipts_status_enum DEFAULT 'DRAFT'::public.purchase_receipts_status_enum NOT NULL,
    note text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    supplier_id uuid NOT NULL,
    "globalDiscountType" public.purchase_receipts_globaldiscounttype_enum DEFAULT 'AMOUNT'::public.purchase_receipts_globaldiscounttype_enum NOT NULL,
    "globalDiscountValue" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "shippingFee" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "amountPaid" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    created_by_id uuid NOT NULL,
    debt numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    CONSTRAINT "CHK_8bcc7d774b426819add07dc618" CHECK ((("globalDiscountType" <> 'PERCENT'::public.purchase_receipts_globaldiscounttype_enum) OR (("globalDiscountValue" >= (0)::numeric) AND ("globalDiscountValue" <= (100)::numeric)))),
    CONSTRAINT "CHK_a03f250ad67ba373c8ada8eaf9" CHECK (("shippingFee" >= (0)::numeric)),
    CONSTRAINT "CHK_b3f0b53330758f6f04d0e98442" CHECK ((debt >= (0)::numeric)),
    CONSTRAINT "CHK_e9c4a8fa2596d0cd177c408d7d" CHECK (("amountPaid" >= (0)::numeric))
);


--
-- Name: purchase_return_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_return_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    quantity numeric(12,3) NOT NULL,
    "conversionToBase" numeric(12,6) NOT NULL,
    "baseQty" numeric(12,3) NOT NULL,
    reason text,
    "unitPrice" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "lineTotalBeforeDiscount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "globalDiscountAllocated" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "lineTotalAfterDiscount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "refundAmount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "performedAt" timestamp with time zone DEFAULT now() NOT NULL,
    purchase_return_id uuid NOT NULL,
    item_id uuid NOT NULL,
    inventory_tx_id uuid,
    performed_by_id uuid,
    CONSTRAINT "CHK_22218cfa539b4c4998474694c5" CHECK ((quantity > (0)::numeric)),
    CONSTRAINT "CHK_24efba068fad544cb168217720" CHECK (("lineTotalAfterDiscount" >= (0)::numeric)),
    CONSTRAINT "CHK_4462e5dc214d5048e80aa114fd" CHECK (("baseQty" > (0)::numeric)),
    CONSTRAINT "CHK_a8d79016e0eb589349d610757b" CHECK (("lineTotalBeforeDiscount" >= (0)::numeric)),
    CONSTRAINT "CHK_c8e1f431dcdfe53591bab18f20" CHECK (("refundAmount" >= (0)::numeric)),
    CONSTRAINT "CHK_d63a2e95f35314c24969510bcd" CHECK (("globalDiscountAllocated" >= (0)::numeric)),
    CONSTRAINT "CHK_fd14e57bc11b69a19825ae5bfe" CHECK (("unitPrice" >= (0)::numeric))
);


--
-- Name: purchase_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_returns (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying NOT NULL,
    "totalGoods" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    discount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "totalAfterDiscount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "refundAmount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    status public.purchase_returns_status_enum DEFAULT 'POSTED'::public.purchase_returns_status_enum NOT NULL,
    note text,
    "paidAmount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    supplier_id uuid NOT NULL,
    created_by_id uuid NOT NULL,
    CONSTRAINT "CHK_0d6313ba8a460ed2c263c6ced0" CHECK (("paidAmount" >= (0)::numeric)),
    CONSTRAINT "CHK_368e6f2eda0070226160773d83" CHECK (("totalAfterDiscount" >= (0)::numeric)),
    CONSTRAINT "CHK_667a143203b1fb5eff8d4e2429" CHECK ((discount >= (0)::numeric)),
    CONSTRAINT "CHK_9466e5928e142594429d9e0a89" CHECK (("totalGoods" >= (0)::numeric)),
    CONSTRAINT "CHK_ae737cb484a86d9636ff5d5c9f" CHECK (("paidAmount" <= "refundAmount"))
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(120) NOT NULL,
    "startTime" character varying(5) NOT NULL,
    "endTime" character varying(5) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    color character varying(10),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "checkInOpen" character varying(5),
    "checkInClose" character varying(5),
    "checkOutOpen" character varying(5),
    "checkOutClose" character varying(5)
);


--
-- Name: supplier_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    description character varying,
    status public.supplier_groups_status_enum DEFAULT 'ACTIVE'::public.supplier_groups_status_enum NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    "taxCode" character varying,
    phone character varying,
    email character varying,
    address character varying,
    note character varying,
    status public.suppliers_status_enum DEFAULT 'ACTIVE'::public.suppliers_status_enum NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    code character varying NOT NULL,
    company character varying,
    city character varying,
    district character varying,
    ward character varying,
    supplier_group_id uuid
);


--
-- Name: tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tables (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    seats integer DEFAULT 4 NOT NULL,
    status public.tables_status_enum DEFAULT 'ACTIVE'::public.tables_status_enum NOT NULL,
    note character varying,
    "orderCount" integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    area_id uuid NOT NULL,
    current_order_id uuid
);


--
-- Name: units_of_measure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units_of_measure (
    code character varying(32) NOT NULL,
    name character varying(64) NOT NULL,
    dimension public.units_of_measure_dimension_enum NOT NULL
);


--
-- Name: uom_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uom_conversions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    factor numeric(12,6) NOT NULL,
    from_code character varying(32),
    to_code character varying(32),
    CONSTRAINT "CHK_7552f31ce681a44a589b115fd8" CHECK ((factor > (0)::numeric))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying NOT NULL,
    "phoneNumber" character varying,
    username character varying,
    password character varying,
    role public.users_role_enum DEFAULT 'WAITER'::public.users_role_enum NOT NULL,
    status character varying DEFAULT 'NEW'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying,
    updated_by character varying,
    "isDelete" boolean DEFAULT false NOT NULL,
    refresh_token text,
    refresh_token_expiry timestamp with time zone
);


--
-- Name: work_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_schedules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    date date NOT NULL,
    note character varying(255),
    "repeatGroupId" uuid,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" uuid NOT NULL,
    "shiftId" uuid NOT NULL
);


--
-- Name: purchase_receipt_items PK_000b04e972179f3d46825f00011; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT "PK_000b04e972179f3d46825f00011" PRIMARY KEY (id);


--
-- Name: order_items PK_005269d8574e6fac0493715c308; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY (id);


--
-- Name: customers PK_133ec679a801fab5e070f73d3ea; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY (id);


--
-- Name: payments PK_197ab7af18c93fbb0c9b28b4a59; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY (id);


--
-- Name: geo_rules PK_2340b23a8dacc104e3672832c41; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_rules
    ADD CONSTRAINT "PK_2340b23a8dacc104e3672832c41" PRIMARY KEY (id);


--
-- Name: categories PK_24dbc6126a28ff948da33e97d3b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY (id);


--
-- Name: cash_other_parties PK_25e6765f61a44e5672c25c8573d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_other_parties
    ADD CONSTRAINT "PK_25e6765f61a44e5672c25c8573d" PRIMARY KEY (id);


--
-- Name: invoice_promotions PK_2c51f5a2dd767c1b3a18a585310; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_promotions
    ADD CONSTRAINT "PK_2c51f5a2dd767c1b3a18a585310" PRIMARY KEY (id);


--
-- Name: promotions PK_380cecbbe3ac11f0e5a7c452c34; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT "PK_380cecbbe3ac11f0e5a7c452c34" PRIMARY KEY (id);


--
-- Name: uom_conversions PK_46a2fed297f3ccdda8ba1c2ea28; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions
    ADD CONSTRAINT "PK_46a2fed297f3ccdda8ba1c2ea28" PRIMARY KEY (id);


--
-- Name: attendances PK_483ed97cd4cd43ab4a117516b69; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendances
    ADD CONSTRAINT "PK_483ed97cd4cd43ab4a117516b69" PRIMARY KEY (id);


--
-- Name: cash_types PK_4fa10257170320dc1cb8607e928; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_types
    ADD CONSTRAINT "PK_4fa10257170320dc1cb8607e928" PRIMARY KEY (id);


--
-- Name: areas PK_5110493f6342f34c978c084d0d6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT "PK_5110493f6342f34c978c084d0d6" PRIMARY KEY (id);


--
-- Name: menu_items PK_57e6188f929e5dc6919168620c8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT "PK_57e6188f929e5dc6919168620c8" PRIMARY KEY (id);


--
-- Name: invoices PK_668cef7c22a427fd822cc1be3ce; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY (id);


--
-- Name: orders PK_710e2d4957aa5878dfe94e4ac2f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY (id);


--
-- Name: promotion_items PK_78f8725c6b3a2ba99895897643f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_items
    ADD CONSTRAINT "PK_78f8725c6b3a2ba99895897643f" PRIMARY KEY (promotion_id, item_id);


--
-- Name: inventory_item_suppliers PK_795dc999e0a96fb22ac32f5e58c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_suppliers
    ADD CONSTRAINT "PK_795dc999e0a96fb22ac32f5e58c" PRIMARY KEY ("inventoryItemsId", "suppliersId");


--
-- Name: units_of_measure PK_7a83359bddb3d311a7556e572d6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units_of_measure
    ADD CONSTRAINT "PK_7a83359bddb3d311a7556e572d6" PRIMARY KEY (code);


--
-- Name: kitchen_batches PK_7ab9c662126b42b0c7a88aa0da8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_batches
    ADD CONSTRAINT "PK_7ab9c662126b42b0c7a88aa0da8" PRIMARY KEY (id);


--
-- Name: tables PK_7cf2aca7af9550742f855d4eb69; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT "PK_7cf2aca7af9550742f855d4eb69" PRIMARY KEY (id);


--
-- Name: branches PK_7f37d3b42defea97f1df0d19535; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "PK_7f37d3b42defea97f1df0d19535" PRIMARY KEY (id);


--
-- Name: shifts PK_84d692e367e4d6cdf045828768c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT "PK_84d692e367e4d6cdf045828768c" PRIMARY KEY (id);


--
-- Name: promotion_categories PK_895f51a1857ad2d6becb5dbb9ea; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_categories
    ADD CONSTRAINT "PK_895f51a1857ad2d6becb5dbb9ea" PRIMARY KEY (promotion_id, category_id);


--
-- Name: profiles PK_8e520eb4da7dc01d0e190447c8e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY (id);


--
-- Name: ingredients PK_9240185c8a5507251c9f15e0649; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT "PK_9240185c8a5507251c9f15e0649" PRIMARY KEY (id);


--
-- Name: inventory_transactions PK_9b7144851f08f9eededde7edd42; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT "PK_9b7144851f08f9eededde7edd42" PRIMARY KEY (id);


--
-- Name: supplier_groups PK_9bca109206fc7c524db10dc7427; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_groups
    ADD CONSTRAINT "PK_9bca109206fc7c524db10dc7427" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: suppliers PK_b70ac51766a9e3144f778cfe81e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY (id);


--
-- Name: net_rules PK_b7617aee35e87aa876bfee97af5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.net_rules
    ADD CONSTRAINT "PK_b7617aee35e87aa876bfee97af5" PRIMARY KEY (id);


--
-- Name: purchase_returns PK_cc2ea54a32938fc38a4e5442330; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT "PK_cc2ea54a32938fc38a4e5442330" PRIMARY KEY (id);


--
-- Name: inventory_items PK_cf2f451407242e132547ac19169; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT "PK_cf2f451407242e132547ac19169" PRIMARY KEY (id);


--
-- Name: kitchen_tickets PK_cf722452891454f278e6c7b4046; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_tickets
    ADD CONSTRAINT "PK_cf722452891454f278e6c7b4046" PRIMARY KEY (id);


--
-- Name: menu_combo_items PK_daea215838501db13bf80c6b4bc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_combo_items
    ADD CONSTRAINT "PK_daea215838501db13bf80c6b4bc" PRIMARY KEY (id);


--
-- Name: order_status_history PK_e6c66d853f155531985fc4f6ec8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT "PK_e6c66d853f155531985fc4f6ec8" PRIMARY KEY (id);


--
-- Name: purchase_receipts PK_e98baf4459530343eebf88fdbdf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT "PK_e98baf4459530343eebf88fdbdf" PRIMARY KEY (id);


--
-- Name: cashbook_entries PK_f4e09859dfac7350631af4efa1a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT "PK_f4e09859dfac7350631af4efa1a" PRIMARY KEY (id);


--
-- Name: work_schedules PK_f5251879700e5ca0d2e353fa34f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_schedules
    ADD CONSTRAINT "PK_f5251879700e5ca0d2e353fa34f" PRIMARY KEY (id);


--
-- Name: purchase_return_logs PK_fb09ba3ac165d00b0fc26cecbc8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_logs
    ADD CONSTRAINT "PK_fb09ba3ac165d00b0fc26cecbc8" PRIMARY KEY (id);


--
-- Name: profiles REL_9e432b7df0d182f8d292902d1a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT "REL_9e432b7df0d182f8d292902d1a" UNIQUE (user_id);


--
-- Name: purchase_returns UQ_0d81377b1640ce9ca35c7a4f30a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT "UQ_0d81377b1640ce9ca35c7a4f30a" UNIQUE (code);


--
-- Name: uom_conversions UQ_11eb3c95984a61ece71a977b543; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions
    ADD CONSTRAINT "UQ_11eb3c95984a61ece71a977b543" UNIQUE (from_code, to_code);


--
-- Name: ingredients UQ_152e6845766876b17a758ccee40; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT "UQ_152e6845766876b17a758ccee40" UNIQUE ("menuItemId", "inventoryItemId");


--
-- Name: users UQ_1e3d0240b49c40521aaeb953293; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_1e3d0240b49c40521aaeb953293" UNIQUE ("phoneNumber");


--
-- Name: supplier_groups UQ_509edd4544e0d1ceb256560cd5b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_groups
    ADD CONSTRAINT "UQ_509edd4544e0d1ceb256560cd5b" UNIQUE (name);


--
-- Name: suppliers UQ_6f01a03dcb1aa33822e19534cd6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT "UQ_6f01a03dcb1aa33822e19534cd6" UNIQUE (code);


--
-- Name: purchase_receipt_items UQ_77f5e4b1f57f24a6c8d91f3eff9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT "UQ_77f5e4b1f57f24a6c8d91f3eff9" UNIQUE (receipt_id, "lineNo");


--
-- Name: attendances UQ_7c999facca426d580d2c235423e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendances
    ADD CONSTRAINT "UQ_7c999facca426d580d2c235423e" UNIQUE ("userId", "dateISO", "shiftId");


--
-- Name: invoice_promotions UQ_7cacba4ad7e398d22ea2824cdd3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_promotions
    ADD CONSTRAINT "UQ_7cacba4ad7e398d22ea2824cdd3" UNIQUE (invoice_id, promotion_id);


--
-- Name: cash_types UQ_83ff530cb913c01a0083ff52ea7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_types
    ADD CONSTRAINT "UQ_83ff530cb913c01a0083ff52ea7" UNIQUE (name);


--
-- Name: customers UQ_88acd889fbe17d0e16cc4bc9174; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT "UQ_88acd889fbe17d0e16cc4bc9174" UNIQUE (phone);


--
-- Name: areas UQ_8c2ad80240e18fcac9e7c526311; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT "UQ_8c2ad80240e18fcac9e7c526311" UNIQUE (name);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: tables UQ_9788715948b5e54ece2860ce706; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT "UQ_9788715948b5e54ece2860ce706" UNIQUE (name, area_id);


--
-- Name: payments UQ_986c2896b803bf83a77e40ee11c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "UQ_986c2896b803bf83a77e40ee11c" UNIQUE ("externalTxnId");


--
-- Name: branches UQ_9c06cbb83feb2f0be6263bd47ee; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "UQ_9c06cbb83feb2f0be6263bd47ee" UNIQUE (code);


--
-- Name: purchase_receipts UQ_a0b46fc42baf810731a52df5c84; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT "UQ_a0b46fc42baf810731a52df5c84" UNIQUE (code);


--
-- Name: cashbook_entries UQ_a3a5fa46db4463251b085c034ff; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT "UQ_a3a5fa46db4463251b085c034ff" UNIQUE (code);


--
-- Name: menu_combo_items UQ_a7a77e17cbc0119e5d60652669d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_combo_items
    ADD CONSTRAINT "UQ_a7a77e17cbc0119e5d60652669d" UNIQUE (combo_id, item_id);


--
-- Name: supplier_groups UQ_ddd28b2e81762818846a99ea407; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_groups
    ADD CONSTRAINT "UQ_ddd28b2e81762818846a99ea407" UNIQUE (code);


--
-- Name: invoices UQ_ea83c3b911906a3578de2340fdf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "UQ_ea83c3b911906a3578de2340fdf" UNIQUE (order_id);


--
-- Name: customers UQ_f2eee14aa1fe3e956fe193c142f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT "UQ_f2eee14aa1fe3e956fe193c142f" UNIQUE (code);


--
-- Name: tables UQ_f5c7a99c42f9b90e1998392322e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT "UQ_f5c7a99c42f9b90e1998392322e" UNIQUE (current_order_id);


--
-- Name: users UQ_fe0bb3f6520ee0469504521e710; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE (username);


--
-- Name: work_schedules UQ_user_date_shift; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_schedules
    ADD CONSTRAINT "UQ_user_date_shift" UNIQUE ("userId", date, "shiftId");


--
-- Name: IDX_15c89b7d322d43f3be1a1af20c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_15c89b7d322d43f3be1a1af20c" ON public.inventory_item_suppliers USING btree ("suppliersId");


--
-- Name: IDX_1a5894bae9dc399a98d036080c; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_1a5894bae9dc399a98d036080c" ON public.categories USING btree (name, type);


--
-- Name: IDX_3291f1daaf8698dcbd3d4b4c90; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3291f1daaf8698dcbd3d4b4c90" ON public.purchase_return_logs USING btree (item_id, "performedAt");


--
-- Name: IDX_43d19956aeab008b49e0804c14; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_43d19956aeab008b49e0804c14" ON public.payments USING btree ("invoiceId");


--
-- Name: IDX_47b38909164446f1343f16692b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_47b38909164446f1343f16692b" ON public.purchase_returns USING btree (supplier_id, "createdAt");


--
-- Name: IDX_5177a9642ff1353fbe5e610053; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5177a9642ff1353fbe5e610053" ON public.promotion_items USING btree (item_id);


--
-- Name: IDX_5b5720d9645cee7396595a16c9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5b5720d9645cee7396595a16c9" ON public.suppliers USING btree (name);


--
-- Name: IDX_60227063c630fb96e4666d6fa8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_60227063c630fb96e4666d6fa8" ON public.promotion_categories USING btree (category_id);


--
-- Name: IDX_66181e465a65c2ddcfa9c00c9c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_66181e465a65c2ddcfa9c00c9c" ON public.suppliers USING btree (email);


--
-- Name: IDX_68a1587d2a61e41695488236a8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_68a1587d2a61e41695488236a8" ON public.promotion_categories USING btree (promotion_id);


--
-- Name: IDX_737a8f37126cb19302085532da; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_737a8f37126cb19302085532da" ON public.inventory_transactions USING btree ("refType", "refId");


--
-- Name: IDX_7837306b219c3093d93316316a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7837306b219c3093d93316316a" ON public.suppliers USING btree (supplier_group_id);


--
-- Name: IDX_794717814cea5fbb502f02008f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_794717814cea5fbb502f02008f" ON public.purchase_receipts USING btree (status, "receiptDate");


--
-- Name: IDX_79c90237802a5463dfff6e5442; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_79c90237802a5463dfff6e5442" ON public.promotions USING btree ("isActive", "startAt", "endAt");


--
-- Name: IDX_842f5836e33601a7fedbe05713; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_842f5836e33601a7fedbe05713" ON public.purchase_return_logs USING btree (purchase_return_id);


--
-- Name: IDX_9e1693887f0da0efac4a728abe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9e1693887f0da0efac4a728abe" ON public.cashbook_entries USING btree (date);


--
-- Name: IDX_ac1036add91b29c71b4c2aefe5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ac1036add91b29c71b4c2aefe5" ON public.promotion_items USING btree (promotion_id);


--
-- Name: IDX_ac68906ac12ddee9637886c768; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ac68906ac12ddee9637886c768" ON public.inventory_item_suppliers USING btree ("inventoryItemsId");


--
-- Name: IDX_b2e6c89183a7ebf2086ebfa578; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b2e6c89183a7ebf2086ebfa578" ON public.menu_combo_items USING btree (combo_id);


--
-- Name: IDX_bf072ff7d62207e219c4d99a00; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bf072ff7d62207e219c4d99a00" ON public.purchase_receipts USING btree (supplier_id, "receiptDate");


--
-- Name: IDX_c3eb14cf3375431fb525fa3b66; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c3eb14cf3375431fb525fa3b66" ON public.invoice_promotions USING btree ("createdAt");


--
-- Name: IDX_c6438ec600415408c01d5c15d0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c6438ec600415408c01d5c15d0" ON public.invoice_promotions USING btree (invoice_id);


--
-- Name: IDX_d0425447ab8baec13ca0064a14; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d0425447ab8baec13ca0064a14" ON public.inventory_transactions USING btree (item_id, "createdAt");


--
-- Name: IDX_d46aa38fa8ce22f79cb1ba1377; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d46aa38fa8ce22f79cb1ba1377" ON public.menu_combo_items USING btree (item_id);


--
-- Name: IDX_d8f8d3788694e1b3f96c42c36f; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_d8f8d3788694e1b3f96c42c36f" ON public.invoices USING btree (invoice_number);


--
-- Name: IDX_dbcae6dc928abd4209411e2048; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dbcae6dc928abd4209411e2048" ON public.payments USING btree ("txnRef");


--
-- Name: IDX_dd44f67433aadad2785aecd5be; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dd44f67433aadad2785aecd5be" ON public.customers USING btree (type);


--
-- Name: IDX_e7919b839d74232c035b4c5c93; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e7919b839d74232c035b4c5c93" ON public.purchase_returns USING btree (status, "createdAt");


--
-- Name: IDX_ef7f8f1699296ab0bfabc5fd48; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ef7f8f1699296ab0bfabc5fd48" ON public.suppliers USING btree (phone);


--
-- Name: IDX_f6a7c50ed4247abaaca498287f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f6a7c50ed4247abaaca498287f" ON public.purchase_return_logs USING btree (purchase_return_id, "performedAt");


--
-- Name: IDX_f7e97730a2e077baa640fd099a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f7e97730a2e077baa640fd099a" ON public.purchase_receipt_items USING btree (item_id);


--
-- Name: IDX_fb036705b38b7437c4e6016eef; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fb036705b38b7437c4e6016eef" ON public.invoice_promotions USING btree (promotion_id);


--
-- Name: IDX_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_user_date" ON public.work_schedules USING btree ("userId", date);


--
-- Name: inventory_transactions FK_073259120ddd23357a88f7cd113; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT "FK_073259120ddd23357a88f7cd113" FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT;


--
-- Name: kitchen_tickets FK_121c2d035c4d7de89ae14d05b69; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_tickets
    ADD CONSTRAINT "FK_121c2d035c4d7de89ae14d05b69" FOREIGN KEY ("orderId") REFERENCES public.orders(id);


--
-- Name: inventory_item_suppliers FK_15c89b7d322d43f3be1a1af20cd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_suppliers
    ADD CONSTRAINT "FK_15c89b7d322d43f3be1a1af20cd" FOREIGN KEY ("suppliersId") REFERENCES public.suppliers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cashbook_entries FK_1b1d4fe67892e5434db499a4a88; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT "FK_1b1d4fe67892e5434db499a4a88" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);


--
-- Name: kitchen_batches FK_224fd2d7837e592b5609256651b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_batches
    ADD CONSTRAINT "FK_224fd2d7837e592b5609256651b" FOREIGN KEY ("orderId") REFERENCES public.orders(id);


--
-- Name: orders FK_2a7fdd7af437285a3ef0fc8b64f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_2a7fdd7af437285a3ef0fc8b64f" FOREIGN KEY ("tableId") REFERENCES public.tables(id);


--
-- Name: orders FK_2c9f0b11f9f5f92d67222a03861; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_2c9f0b11f9f5f92d67222a03861" FOREIGN KEY (merged_into_id) REFERENCES public.orders(id);


--
-- Name: cashbook_entries FK_2d1cbf9002277863bdafd7b45b1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT "FK_2d1cbf9002277863bdafd7b45b1" FOREIGN KEY (cash_type_id) REFERENCES public.cash_types(id);


--
-- Name: purchase_returns FK_2ede10d78859f6e2992e3fc57eb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT "FK_2ede10d78859f6e2992e3fc57eb" FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: ingredients FK_371a0b9a9f80e75b23f3e121b4e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT "FK_371a0b9a9f80e75b23f3e121b4e" FOREIGN KEY ("inventoryItemId") REFERENCES public.inventory_items(id);


--
-- Name: orders FK_39b1402eea81b07616277578fa5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_39b1402eea81b07616277578fa5" FOREIGN KEY ("createdById") REFERENCES public.users(id);


--
-- Name: cashbook_entries FK_3fb9733b24370a1427209dba915; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT "FK_3fb9733b24370a1427209dba915" FOREIGN KEY (purchase_receipt_id) REFERENCES public.purchase_receipts(id);


--
-- Name: work_schedules FK_3fe6d7c73fd1e4a077955ffcf9d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_schedules
    ADD CONSTRAINT "FK_3fe6d7c73fd1e4a077955ffcf9d" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cashbook_entries FK_4078c48fa68ae4435ce77c6fe22; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT "FK_4078c48fa68ae4435ce77c6fe22" FOREIGN KEY (cash_other_party_id) REFERENCES public.cash_other_parties(id);


--
-- Name: payments FK_43d19956aeab008b49e0804c145; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "FK_43d19956aeab008b49e0804c145" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: promotion_items FK_5177a9642ff1353fbe5e6100535; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_items
    ADD CONSTRAINT "FK_5177a9642ff1353fbe5e6100535" FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cashbook_entries FK_56b2435dc3ffaf19d5d68d729fa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT "FK_56b2435dc3ffaf19d5d68d729fa" FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: uom_conversions FK_57f04817d4fdac18268f884c6c1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions
    ADD CONSTRAINT "FK_57f04817d4fdac18268f884c6c1" FOREIGN KEY (from_code) REFERENCES public.units_of_measure(code);


--
-- Name: purchase_receipts FK_582b3fc1306f08cd460af495043; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT "FK_582b3fc1306f08cd460af495043" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: attendances FK_5e20bdbc6b72f0da23eb2ff1b60; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendances
    ADD CONSTRAINT "FK_5e20bdbc6b72f0da23eb2ff1b60" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: promotion_categories FK_60227063c630fb96e4666d6fa83; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_categories
    ADD CONSTRAINT "FK_60227063c630fb96e4666d6fa83" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ingredients FK_62c8b21ef508e1f98537014d2c6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT "FK_62c8b21ef508e1f98537014d2c6" FOREIGN KEY ("menuItemId") REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: invoices FK_65e3145f317bd655481d3f96c74; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "FK_65e3145f317bd655481d3f96c74" FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: order_status_history FK_689db3835e5550e68d26ca32676; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT "FK_689db3835e5550e68d26ca32676" FOREIGN KEY ("orderId") REFERENCES public.orders(id);


--
-- Name: promotion_categories FK_68a1587d2a61e41695488236a8e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_categories
    ADD CONSTRAINT "FK_68a1587d2a61e41695488236a8e" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: suppliers FK_7837306b219c3093d93316316ac; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT "FK_7837306b219c3093d93316316ac" FOREIGN KEY (supplier_group_id) REFERENCES public.supplier_groups(id) ON DELETE SET NULL;


--
-- Name: purchase_receipts FK_7fc20a3625b51415f81e9f0c4ed; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT "FK_7fc20a3625b51415f81e9f0c4ed" FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: purchase_return_logs FK_842f5836e33601a7fedbe05713f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_logs
    ADD CONSTRAINT "FK_842f5836e33601a7fedbe05713f" FOREIGN KEY (purchase_return_id) REFERENCES public.purchase_returns(id) ON DELETE CASCADE;


--
-- Name: attendances FK_843ba5757253bd38a9a6bc064e7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendances
    ADD CONSTRAINT "FK_843ba5757253bd38a9a6bc064e7" FOREIGN KEY ("shiftId") REFERENCES public.shifts(id);


--
-- Name: purchase_returns FK_8c67adeb896936f85272e7e8b16; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT "FK_8c67adeb896936f85272e7e8b16" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: inventory_items FK_934d5a332b6870c7bb95643ab41; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT "FK_934d5a332b6870c7bb95643ab41" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: tables FK_9371712959bf7427eb104769ac6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT "FK_9371712959bf7427eb104769ac6" FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE RESTRICT;


--
-- Name: purchase_return_logs FK_9ab5eae4269550d53072dd0d65b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_logs
    ADD CONSTRAINT "FK_9ab5eae4269550d53072dd0d65b" FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT;


--
-- Name: profiles FK_9e432b7df0d182f8d292902d1a2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: promotion_items FK_ac1036add91b29c71b4c2aefe5e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_items
    ADD CONSTRAINT "FK_ac1036add91b29c71b4c2aefe5e" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: inventory_item_suppliers FK_ac68906ac12ddee9637886c7685; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_suppliers
    ADD CONSTRAINT "FK_ac68906ac12ddee9637886c7685" FOREIGN KEY ("inventoryItemsId") REFERENCES public.inventory_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: menu_combo_items FK_b2e6c89183a7ebf2086ebfa5788; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_combo_items
    ADD CONSTRAINT "FK_b2e6c89183a7ebf2086ebfa5788" FOREIGN KEY (combo_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: cashbook_entries FK_b55ff01af2a17800b7436fe24cf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashbook_entries
    ADD CONSTRAINT "FK_b55ff01af2a17800b7436fe24cf" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: purchase_receipt_items FK_bf38866ccc316441b3067d3d38f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT "FK_bf38866ccc316441b3067d3d38f" FOREIGN KEY (received_uom_code) REFERENCES public.units_of_measure(code);


--
-- Name: invoices FK_c07224a78c1fd5dcd38e91284c5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "FK_c07224a78c1fd5dcd38e91284c5" FOREIGN KEY (cashier_id) REFERENCES public.users(id);


--
-- Name: inventory_items FK_c34172ca63f80ff6178f0bb9122; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT "FK_c34172ca63f80ff6178f0bb9122" FOREIGN KEY (base_uom_code) REFERENCES public.units_of_measure(code);


--
-- Name: invoice_promotions FK_c6438ec600415408c01d5c15d06; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_promotions
    ADD CONSTRAINT "FK_c6438ec600415408c01d5c15d06" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: purchase_return_logs FK_ca47dd29d40f1b65dcd2c70a7e9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_logs
    ADD CONSTRAINT "FK_ca47dd29d40f1b65dcd2c70a7e9" FOREIGN KEY (inventory_tx_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: kitchen_tickets FK_d10899e8287cef31e7c87f67bad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_tickets
    ADD CONSTRAINT "FK_d10899e8287cef31e7c87f67bad" FOREIGN KEY ("batchId") REFERENCES public.kitchen_batches(id);


--
-- Name: purchase_receipt_items FK_d2ec47c26887dd013927a0a2679; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT "FK_d2ec47c26887dd013927a0a2679" FOREIGN KEY (receipt_id) REFERENCES public.purchase_receipts(id) ON DELETE CASCADE;


--
-- Name: menu_combo_items FK_d46aa38fa8ce22f79cb1ba1377a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_combo_items
    ADD CONSTRAINT "FK_d46aa38fa8ce22f79cb1ba1377a" FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE RESTRICT;


--
-- Name: kitchen_tickets FK_d4dac700cc388bfa0ba93f5dc10; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_tickets
    ADD CONSTRAINT "FK_d4dac700cc388bfa0ba93f5dc10" FOREIGN KEY ("menuItemId") REFERENCES public.menu_items(id);


--
-- Name: menu_items FK_d56e5ccc298e8bf721f75a7eb96; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT "FK_d56e5ccc298e8bf721f75a7eb96" FOREIGN KEY ("categoryId") REFERENCES public.categories(id);


--
-- Name: order_items FK_d8453d5a71e525d9b406c35aab8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT "FK_d8453d5a71e525d9b406c35aab8" FOREIGN KEY ("menuItemId") REFERENCES public.menu_items(id);


--
-- Name: work_schedules FK_e4e2de28cf4f6793bc792e02eed; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_schedules
    ADD CONSTRAINT "FK_e4e2de28cf4f6793bc792e02eed" FOREIGN KEY ("shiftId") REFERENCES public.shifts(id) ON DELETE CASCADE;


--
-- Name: uom_conversions FK_e5e7611c61c4f3cf400b9e76ee0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions
    ADD CONSTRAINT "FK_e5e7611c61c4f3cf400b9e76ee0" FOREIGN KEY (to_code) REFERENCES public.units_of_measure(code);


--
-- Name: inventory_transactions FK_e9ee5e047ab2db01665b51affe6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT "FK_e9ee5e047ab2db01665b51affe6" FOREIGN KEY (performed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: invoices FK_ea83c3b911906a3578de2340fdf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "FK_ea83c3b911906a3578de2340fdf" FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_status_history FK_ead252d47ce0ef306300e7e14ec; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT "FK_ead252d47ce0ef306300e7e14ec" FOREIGN KEY ("updatedById") REFERENCES public.users(id);


--
-- Name: order_items FK_f1d359a55923bb45b057fbdab0d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d" FOREIGN KEY ("orderId") REFERENCES public.orders(id);


--
-- Name: tables FK_f5c7a99c42f9b90e1998392322e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT "FK_f5c7a99c42f9b90e1998392322e" FOREIGN KEY (current_order_id) REFERENCES public.orders(id);


--
-- Name: purchase_return_logs FK_f61d63e015e3742ecaa111bdce8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_logs
    ADD CONSTRAINT "FK_f61d63e015e3742ecaa111bdce8" FOREIGN KEY (performed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: purchase_receipt_items FK_f7e97730a2e077baa640fd099a0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT "FK_f7e97730a2e077baa640fd099a0" FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT;


--
-- Name: invoice_promotions FK_fb036705b38b7437c4e6016eef9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_promotions
    ADD CONSTRAINT "FK_fb036705b38b7437c4e6016eef9" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict 6x8xEJV3UdLfSIu2k8caV6sQQy4g6ieIdaTRgLZ9WNgd3w2Fuqm6wg8mgvb1P4N

