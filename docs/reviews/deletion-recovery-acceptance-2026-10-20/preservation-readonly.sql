BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object('sampled_at',now(),'account_id','5bee300b-7ded-48ec-99ac-403908a82d1a',
 'auth_user_exists',EXISTS(SELECT 1 FROM auth.users WHERE id='5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'identities',(SELECT count(*) FROM auth.identities WHERE user_id='5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'sessions',(SELECT count(*) FROM auth.sessions WHERE user_id='5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'profiles',(SELECT count(*) FROM fieldmaps.profiles WHERE user_id='5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'project_memberships',(SELECT count(*) FROM fieldmaps.project_memberships WHERE user_id='5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'organization_memberships',(SELECT count(*) FROM fieldmaps.organization_members WHERE user_id='5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'pending_deletion',(SELECT count(*) FROM fieldmaps_private.account_deletions WHERE user_id='5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'total_backlog',(SELECT count(*) FROM fieldmaps_private.account_deletions),
 'other_auth_ids',(SELECT encode(extensions.digest(coalesce(string_agg(id::text,E'\n' ORDER BY id),''),'sha256'),'hex') FROM auth.users WHERE id<>'5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'other_profiles',(SELECT encode(extensions.digest(coalesce(string_agg(to_jsonb(p)::text,E'\n' ORDER BY p.user_id),''),'sha256'),'hex') FROM fieldmaps.profiles p WHERE user_id<>'5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'other_memberships',(SELECT encode(extensions.digest(coalesce(string_agg(to_jsonb(p)::text,E'\n' ORDER BY p.project_id,p.user_id),''),'sha256'),'hex') FROM fieldmaps.project_memberships p WHERE user_id<>'5bee300b-7ded-48ec-99ac-403908a82d1a'::uuid),
 'research',(SELECT jsonb_build_object('count',count(*),'sha256',encode(extensions.digest(coalesce(string_agg(to_jsonb(o)::text,E'\n' ORDER BY o.id),''),'sha256'),'hex')) FROM fieldmaps.observations o),
 'form_fingerprint',(SELECT encode(extensions.digest(coalesce(string_agg(to_jsonb(v)::text,E'\n' ORDER BY v.id),''),'sha256'),'hex') FROM fieldmaps.form_versions v),
 'package_fingerprint',(SELECT encode(extensions.digest(coalesce(string_agg((to_jsonb(p)-'archive')::text,E'\n' ORDER BY p.id),''),'sha256'),'hex') FROM fieldmaps.site_packages p),
 'packages',(SELECT jsonb_agg(jsonb_build_object('id',id,'archive_sha256',archive_sha256,'digest_matches',encode(extensions.digest(archive,'sha256'),'hex')=archive_sha256) ORDER BY id) FROM fieldmaps.site_packages)
) AS after_deletion;
ROLLBACK;
