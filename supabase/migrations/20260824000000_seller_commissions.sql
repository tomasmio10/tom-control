create table if not exists public.seller_commission_payments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  constraint seller_commission_payments_note_length check (note is null or char_length(note) <= 500)
);

create index if not exists seller_commission_payments_seller_date_idx
  on public.seller_commission_payments (seller_id, payment_date desc, created_at desc);

alter table public.seller_commission_payments enable row level security;

revoke all on table public.seller_commission_payments from anon, authenticated;
grant select on table public.seller_commission_payments to authenticated;

drop policy if exists "Active admins and owners can read commission payments" on public.seller_commission_payments;
create policy "Active admins and owners can read commission payments"
on public.seller_commission_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles caller
    where caller.id = auth.uid()
      and caller.is_active = true
      and (
        caller.role = 'admin'
        or (caller.role = 'seller' and seller_id = auth.uid())
      )
  )
);

create or replace function public.get_seller_commission_summary()
returns table (
  seller_id uuid,
  full_name text,
  valid_sales numeric,
  payable_commission numeric,
  cancelled_commission numeric,
  paid_commission numeric,
  overpaid_commission numeric,
  pending_commission numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_caller_active boolean;
begin
  select p.role::text, p.is_active
    into v_caller_role, v_caller_active
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_caller_active, false) is not true or v_caller_role not in ('admin', 'seller') then
    raise exception 'Active admin or seller profile required' using errcode = '42501';
  end if;

  return query
  with generated as (
    select
      o.seller_id,
      coalesce(sum(case when o.status <> 'cancelled' then o.sale_total else 0 end), 0)::numeric as valid_sales,
      coalesce(sum(case when o.status <> 'cancelled' then f.seller_commission_amount else 0 end), 0)::numeric as payable_commission,
      coalesce(sum(case when o.status = 'cancelled' then f.seller_commission_amount else 0 end), 0)::numeric as cancelled_commission
    from public.orders o
    join public.order_financials f on f.order_id = o.id
    group by o.seller_id
  ), paid as (
    select cp.seller_id, coalesce(sum(cp.amount), 0)::numeric as paid_commission
    from public.seller_commission_payments cp
    group by cp.seller_id
  )
  select
    seller.id,
    seller.full_name,
    coalesce(g.valid_sales, 0)::numeric,
    coalesce(g.payable_commission, 0)::numeric,
    coalesce(g.cancelled_commission, 0)::numeric,
    coalesce(pd.paid_commission, 0)::numeric,
    greatest(coalesce(pd.paid_commission, 0) - coalesce(g.payable_commission, 0), 0)::numeric,
    greatest(coalesce(g.payable_commission, 0) - coalesce(pd.paid_commission, 0), 0)::numeric
  from public.profiles seller
  left join generated g on g.seller_id = seller.id
  left join paid pd on pd.seller_id = seller.id
  where seller.role = 'seller'
    and (v_caller_role = 'admin' or seller.id = auth.uid())
  order by seller.full_name;
end;
$$;

create or replace function public.get_seller_commission_detail(p_seller_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_caller_active boolean;
  v_seller_id uuid := coalesce(p_seller_id, auth.uid());
  v_seller_name text;
  v_summary jsonb;
  v_sales jsonb;
  v_payments jsonb;
begin
  select p.role::text, p.is_active
    into v_caller_role, v_caller_active
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_caller_active, false) is not true or v_caller_role not in ('admin', 'seller') then
    raise exception 'Active admin or seller profile required' using errcode = '42501';
  end if;
  if v_caller_role = 'seller' and v_seller_id <> auth.uid() then
    raise exception 'Sellers can only view their own commissions' using errcode = '42501';
  end if;

  select p.full_name into v_seller_name
  from public.profiles p
  where p.id = v_seller_id and p.role = 'seller';
  if v_seller_name is null then
    raise exception 'Seller profile not found' using errcode = 'P0002';
  end if;

  select to_jsonb(summary_row) into v_summary
  from public.get_seller_commission_summary() summary_row
  where summary_row.seller_id = v_seller_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id', o.id,
    'order_number', o.order_number,
    'created_at', o.created_at,
    'status', o.status,
    'sale_total', o.sale_total,
    'seller_commission_amount', f.seller_commission_amount,
    'is_payable', o.status <> 'cancelled'
  ) order by o.created_at desc), '[]'::jsonb)
  into v_sales
  from public.orders o
  join public.order_financials f on f.order_id = o.id
  where o.seller_id = v_seller_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cp.id,
    'amount', cp.amount,
    'payment_date', cp.payment_date,
    'note', cp.note,
    'recorded_by', cp.recorded_by,
    'created_at', cp.created_at
  ) order by cp.payment_date desc, cp.created_at desc), '[]'::jsonb)
  into v_payments
  from public.seller_commission_payments cp
  where cp.seller_id = v_seller_id;

  return jsonb_build_object(
    'summary', coalesce(v_summary, jsonb_build_object(
      'seller_id', v_seller_id,
      'full_name', v_seller_name,
      'valid_sales', 0,
      'payable_commission', 0,
      'cancelled_commission', 0,
      'paid_commission', 0,
      'overpaid_commission', 0,
      'pending_commission', 0
    )),
    'sales', v_sales,
    'payments', v_payments
  );
end;
$$;

create or replace function public.register_seller_commission_payment(
  p_seller_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_note text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns table (
  payment_id uuid,
  seller_id uuid,
  amount numeric,
  payment_date date,
  note text,
  created_at timestamptz,
  pending_commission numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_active boolean;
  v_caller_role text;
  v_existing public.seller_commission_payments%rowtype;
  v_payment public.seller_commission_payments%rowtype;
  v_payable numeric;
  v_paid numeric;
  v_pending numeric;
begin
  select p.role::text, p.is_active
    into v_caller_role, v_caller_active
  from public.profiles p
  where p.id = auth.uid();

  if v_caller_role <> 'admin' or coalesce(v_caller_active, false) is not true then
    raise exception 'Only an active administrator can register commission payments' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;
  if p_payment_date is null then
    raise exception 'Payment date is required' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_seller_id and p.role = 'seller') then
    raise exception 'Seller profile not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_seller_id::text, 0));

  select cp.* into v_existing
  from public.seller_commission_payments cp
  where cp.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.seller_id <> p_seller_id or v_existing.amount <> p_amount or v_existing.payment_date <> p_payment_date then
      raise exception 'Idempotency key was already used for a different payment' using errcode = '23505';
    end if;
    select coalesce(sum(case when o.status <> 'cancelled' then f.seller_commission_amount else 0 end), 0)
      into v_payable
    from public.orders o
    join public.order_financials f on f.order_id = o.id
    where o.seller_id = p_seller_id;
    select coalesce(sum(cp.amount), 0) into v_paid
    from public.seller_commission_payments cp where cp.seller_id = p_seller_id;
    return query select v_existing.id, v_existing.seller_id, v_existing.amount, v_existing.payment_date,
      v_existing.note, v_existing.created_at, greatest(v_payable - v_paid, 0)::numeric;
    return;
  end if;

  select coalesce(sum(case when o.status <> 'cancelled' then f.seller_commission_amount else 0 end), 0)
    into v_payable
  from public.orders o
  join public.order_financials f on f.order_id = o.id
  where o.seller_id = p_seller_id;

  select coalesce(sum(cp.amount), 0) into v_paid
  from public.seller_commission_payments cp
  where cp.seller_id = p_seller_id;

  v_pending := greatest(v_payable - v_paid, 0);
  if p_amount > v_pending then
    raise exception 'Payment exceeds pending commission balance' using errcode = '22023';
  end if;

  insert into public.seller_commission_payments (seller_id, amount, payment_date, note, recorded_by, idempotency_key)
  values (p_seller_id, p_amount, p_payment_date, nullif(btrim(p_note), ''), auth.uid(), p_idempotency_key)
  returning * into v_payment;

  return query select v_payment.id, v_payment.seller_id, v_payment.amount, v_payment.payment_date,
    v_payment.note, v_payment.created_at, greatest(v_pending - v_payment.amount, 0)::numeric;
end;
$$;

revoke all on function public.get_seller_commission_summary() from public, anon;
revoke all on function public.get_seller_commission_detail(uuid) from public, anon;
revoke all on function public.register_seller_commission_payment(uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.get_seller_commission_summary() to authenticated;
grant execute on function public.get_seller_commission_detail(uuid) to authenticated;
grant execute on function public.register_seller_commission_payment(uuid, numeric, date, text, uuid) to authenticated;
