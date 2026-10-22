const NOT_THE_PAGE =
	/This page is not on the map|Page not found|You were signed out|Couldn.t load|Something went wrong|could not be found/i;
for (const s of ["Only project managers can open the team.","You do not have access to this page.","Only project managers and viewers can see a site's zones.","Couldn't load the team","This page is not on the map"]) console.log(JSON.stringify(s), NOT_THE_PAGE.test(s));
