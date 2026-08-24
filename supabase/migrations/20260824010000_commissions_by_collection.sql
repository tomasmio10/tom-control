create or replace function public.get_seller_commission_accruals()
returns table (
  seller_id uuid,
  order_id uuid,
  order_number bigint,
  created_at timestamptz,
  status text,
  sale_total numeric,
  amount_paid numeric,
  total_commission numeric,
  generated_commission numeric,
  cancelled_commission numeric
)
language sql
security definer
set search_path = ''
as $$
  with collected as (
    select
      op.order_id,
      coalesce(sum(op.amount) filter (where op.is_voided is not true), 0)::numeric as amount_paid
    from public.order_payments op
    group by op.order_id
  )
  select
    o.seller_id,
    o.id,
    o.order_number::bigint,
    o.created_at,
    o.status::text,
    o.sale_total::numeric,
    least(greatest(coalesce(c.amount_paid, 0), 0), greatest(o.sale_total, 0))::numeric,
    f.seller_commission_amount::numeric,
    case
      when o.status = 'cancelled' or o.sale_total <= 0 then 0::numeric
      else round(
        f.seller_commission_amount
        * least(greatest(coalesce(c.amount_paid, 0), 0), o.sale_total)
        / o.sale_total,
        2
      )::numeric
    end,
    case when o.status = 'cancelled' then f.seller_commission_amount else 0 end::numeric
  from public.orders o
  join public.order_financials f on f.order_id = o.id
  left join collected c on c.order_id = o.id;
$$;

revoke all on function public.get_seller_commission_accruals() from public, anon, authenticated;

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
      accrual.seller_id,
      coalesce(sum(case when accrual.status <> 'cancelled' then accrual.sale_total else 0 end), 0)::numeric as valid_sales,
      coalesce(sum(accrual.generated_commission), 0)::numeric as payable_commission,
      coalesce(sum(accrual.cancelled_commission), 0)::numeric as cancelled_commission
    from public.get_seller_commission_accruals() accrual
    group by accrual.seller_id
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
    'order_id', accrual.order_id,
    'order_number', accrual.order_number,
    'created_at', accrual.created_at,
    'status', accrual.status,
    'sale_total', accrual.sale_total,
    'amount_paid', accrual.amount_paid,
    'seller_commission_amount', accrual.total_commission,
    'generated_commission_amount', accrual.generated_commission,
    'remaining_commission_amount', greatest(accrual.total_commission - accrual.generated_commission, 0),
    'is_payable', accrual.status <> 'cancelled'
  ) order by accrual.created_at desc), '[]'::jsonb)
  into v_sales
  from public.get_seller_commission_accruals() accrual
  where accrual.seller_id = v_seller_id;

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
  v_existing_found boolean;
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
  v_existing_found := found;

  select coalesce(sum(accrual.generated_commission), 0)
    into v_payable
  from public.get_seller_commission_accruals() accrual
  where accrual.seller_id = p_seller_id;

  select coalesce(sum(cp.amount), 0) into v_paid
  from public.seller_commission_payments cp
  where cp.seller_id = p_seller_id;

  if v_existing_found then
    if v_existing.seller_id <> p_seller_id or v_existing.amount <> p_amount or v_existing.payment_date <> p_payment_date then
      raise exception 'Idempotency key was already used for a different payment' using errcode = '23505';
    end if;
    return query select v_existing.id, v_existing.seller_id, v_existing.amount, v_existing.payment_date,
      v_existing.note, v_existing.created_at, greatest(v_payable - v_paid, 0)::numeric;
    return;
  end if;

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
