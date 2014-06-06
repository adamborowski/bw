/**
 * The JavaScript library for the SWA components.
 * 
 * Note that this is under active development and some parts of this API
 * are more stable than others.
 * 
 * The public API that is considered relatively safe can be found on the top
 * of this file - anything under the demarkation line should only be used at
 * your own risk.  Please contact the developers if you need some specific
 * feature promoted to the stable API, or if you find a bug or limitation.
 */

// Global constants for RDF namespace
var rdf = {
		type: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
};

var rdfs = {
		domain: 'http://www.w3.org/2000/01/rdf-schema#domain',
		subClassOf: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
		subPropertyOf: 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf'
};

// The main JavaScript object with references to the available functions
// (attached as fields so that they can more easily be "overloaded" by
// custom applications).
var swa = {

	// True if the "Enter log message" box has been activated
	logMessageBoxStatus : false,
		
	// The current (modal) progress monitor dialog
	progressMonitorDialog : null,
	
	// The progressId used by the current monitor dialog
	progressMonitorDialogId : null,
	
	// Should be set by application when starting up, contains the current base URI as string
	queryGraphURI : null,

	// Whether to search the in-memory graph or search external data sources
	searchMemoryModel : false,

	// Set this true when a search is requested
	searchPerformed : false,

	// Server URL
	server : '',

	// Relative name of the main servlet
	servlet : 'swp'
};


/**
 * Replaces the content of a given jQuery element with a loading indicator
 * (spinning wheel).
 * @param e  the jQuery element
 */
swa.insertLoadingIndicator = function(e) {
	e.html('<div class="swa-loading-indicator"></div>');
};


/**
 * Reloads a ui:loadable using a jQuery Ajax call.
 * In addition to the id of the loadable, this function can take a JavaScript
 * object with name-value pairs.  The names will become pre-bound variables
 * in the reloaded view.  The values must be parsable RDF nodes (in SPARQL
 * syntax, e.g. '<http://example.org/MyClass>' or '"2011-11-11"^^xsd:date'. 
 * @param id  the id of the loadable
 * @param args  a JavaScript object with additional parameters
 * @param callback  an optional callback that is called after loading
 */
swa.load = function(id, args, callback, withoutIndicator) {
	var e = $('#' + id);
	if(e.length == 0) {
		alert('Error: Invalid use of swa.load: No element found with id ' + id);
		return;
	}
	var base = e.attr('uistate');
	if(!base) {
		alert('Error: Invalid use of swa.load: Missing uistate attribute at ' + id);
		return;
	}
	if(base.indexOf("&_window=true") > 0) {
		swa.loadWindow(id, args, callback);
		return;
	}

	// Unsubscribe from any event this ui:loadable has subscribed to before.
	swa.unsubscribeWindow(id);
	
	var url = base;
	if(args) {
		var c = {};
		for(var key in args) {
			c['_scope' + key] = args[key];
		}
		var p = jQuery.param(c);
		url = p + "&" + base;
	}
	url += '&_snippet=true';
	if (swa.server != '') {
		url += '&_server=' + escape(swa.server);
	}
	if(!withoutIndicator) {
		swa.insertLoadingIndicator(e);
	}
	// TODO: Error handling may not work yet
	e.load(swa.server + swa.servlet, url, function() {
		swa.loadPostProcessAll(e);
		if(callback) {
			callback.call();
		}
	});
};


/**
 * Loads a given ui:loadable with a given variable pre-bound to
 * a given URI resource.
 * This can be used as onSelect handler of tree and grid elements,
 * e.g. onSelect="swa.loadWithResource('form', 'resource', resource)"
 * @param loadId  the id of the ui:loadable
 * @param varName  the name of the variable to set
 * @param resourceURI  the URI of the resource
 */
swa.loadWithResource = function(loadId, varName, resourceURI) {
	var params = {};
	params[varName] = '<' + resourceURI + '>';
	swa.load(loadId, params);
};




// PRIVATE UNSTABLE API follows -----------------------------------------------

// Global index that is incremented at each addRow operation
swa.addRowIndex = 0;

// Function that shall be called when an edit has been processed
// The data parameter contains the JSON response 
swa.onEdit = null;


// Helper function called when the user clicks the Add button on a property marked as swa:blankNodeProperty
swa.addBlankNodeObjectEditorRow = function(queryGraphURI, bodyId, single, subjectURI, predicateURI) {
	var params = {
			_base : queryGraphURI,
			_snippet : true,
			_viewClass : 'swa:ObjectEditorRow',
			predicate : '<' + predicateURI + '>',
			subject : '<' + subjectURI + '>'
	};
	$.get(swa.servlet, params, function(data) {
		$('#' + bodyId).append(data);
		if(single) {
			$('#' + bodyId).parent().parent().find('.swa-add-button-div').each(function(i,item) {
				$(item).addClass('swa-display-none');
				$(item).removeClass('swa-icon');
			});
		}
	});
};


// Helper function used to either insert a new row to either an object widget or a subject widget. 
swa.addEditorRow = function(queryGraphURI, bodyId, single, viewClass, predicateURI, params, appName) {
	params._base = queryGraphURI;
	params._snippet = true;
	params._viewClass = viewClass;
	params.predicate = '<' + predicateURI + '>';
	if(appName && appName != '') {
		params['_contextswaAppName'] = '"' + appName + '"';
	}
	$.get(swa.server + swa.servlet, params, function(data) {
		$('#' + bodyId).append(data);
		if(single) {
			$('#' + bodyId).parent().parent().find('.swa-add-button-div').each(function(i,item) {
				$(item).addClass('swa-display-none');
				$(item).removeClass('swa-icon');
			});
		}
	});
};


// Helper of swa:AddPropertyBox
swa.addPropertyToSearchForm = function(id, propertyURI) {
	var loadable = $('#' + id + '-object');
	var uistate = loadable.attr('uistate');
	var params = uistate + '&_snippet=true&addProperty=<' + escape(propertyURI) + '>';
	$.get(swa.servlet, params, function(data) {
		loadable.append(data);
		swa.load(id);
	});
};


/**
 * Called when the user adds a new row to an object widget.
 * @param queryGraphURI  the query graph URI
 * @param bodyId  the id of the widget's body
 * @param single  true to disable the add button when done
 * @param subjectURI  the URI of the subject
 * @param predicateURI  the URI of the predicate
 * @param appName  the current app name (optional)
 * @param editWidgetURI  the URI of the declared arg:editWidget (optional)
 */
swa.addObjectEditorRow = function(queryGraphURI, bodyId, single, subjectURI, predicateURI, appName, editWidgetURI) {
	var params = {
			subject : '<' + subjectURI + '>'
	};
	if(editWidgetURI && editWidgetURI != '') {
		params['_contexteditWidget'] = '<' + editWidgetURI + '>';
	}
	swa.addEditorRow(queryGraphURI, bodyId, single, 'swa:ObjectEditorRow', predicateURI, params, appName);
};


/**
 * Called when the user adds a new row to a subject widget.
 * @param queryGraphURI  the query graph URI
 * @param bodyId  the id of the widget's body
 * @param single  true to disable the add button when done
 * @param objectURI  the URI of the object
 * @param predicateURI  the URI of the predicate
 * @param appName  the current app name (optional)
 * @param editWidgetURI  the URI of the declared arg:editWidget (optional)
 */
swa.addSubjectEditorRow = function(queryGraphURI, bodyId, single, objectURI, predicateURI, appName, editWidgetURI) {
	var params = {
			object : '<' + objectURI + '>'
	};
	if(editWidgetURI && editWidgetURI != '') {
		params['_contexteditWidget'] = '<' + editWidgetURI + '>';
	}
	swa.addEditorRow(queryGraphURI, bodyId, single, 'swa:SubjectEditorRow', predicateURI, params, appName);
};


/**
 * Calls an edit handler and updates the UI to reflect the changes.
 * @param handlerName  the qname of the handler (becomes _viewClass)
 * @param params  arguments for the call - note this will be modified
 * @param errorCallback  an optional callback with one argument for error handling
 * @param progressTitle  an optional title for a progress dialog
 */
swa.callHandler = function(handlerName, params, errorCallback, progressTitle) {
	params['_base'] = swa.queryGraphURI;
	params['_format'] = 'json';
	params['_snippet'] = true;
	params['_viewClass'] = handlerName;
	if (swa.server != '') {
		params['_server'] = escape(swa.server);
	}
	if(progressTitle) {
		var progressId = 'swa-progress-' + Math.random();
		params['_progressId'] = progressId;
	    swa.openProgressMonitorDialog(progressId, progressTitle);
	}
	$.get(swa.server + swa.servlet, params, function(data) {
		if(data && data.error) {
			if(errorCallback) {
				errorCallback(data.error);
			}
			else {
				alert('Operation failed: ' + data.error);				
			}
		}
		else {
			swa.processEdits(data);
		}
	});
};


/**
 * Executes a SPARQLMotion script on the server.
 * The script must be globally registered (using an .sms. file).
 * @param script  the qname of the script
 * @param params  the parameters
 * @param callback  a JavaScript expression that shall be executed when the script
 *                  finishes.  Can access the result of the script with the variable 'data'.
 */
swa.callSPARQLMotionScript = function(script, params, callback) {
	params['id'] = script;
	if(!params['_base'] && swa.queryGraphURI) {
		params['_base'] = swa.queryGraphURI;
	}
	$.get('sparqlmotion', params, function(data) {
		if(callback) {
			eval(callback);
		}
	});
};


swa.collectAddedTreeNodes = function(predicateURI, subjectChanges, treeId, nodeIds) {
	var added = subjectChanges[predicateURI];
	if(added) {
		for(var objectKey in added) {
			var objectURI = added[objectKey];
			$('#' + treeId).find('li[resource="' + objectURI + '"]').each(function(index, node) {
				var id = $(node).attr('id');
				nodeIds[id] = true;
			});
		}
	}
};


swa.collectChangesForClassTree = function(change, treeId, nodeIds) {
	
	for(var subjectURI in change.changes) {
		var subjectChanges = change.changes[subjectURI];
	
		// Changed rdfs:subClassOf triples
		swa.collectAddedTreeNodes(rdfs.subClassOf, subjectChanges, treeId, nodeIds);
		swa.collectDeletedTreeNodes(rdfs.subClassOf, subjectChanges, treeId, nodeIds);
	}
};


swa.collectDeletedTreeNodes = function(predicateURI, subjectChanges, treeId, nodeIds) {
	var deleted = subjectChanges['-' + predicateURI];
	if(deleted) {
		for(var objectKey in deleted) {
			var objectURI = deleted[objectKey];
			$('#' + treeId).find('li[resource="' + objectURI + '"]').each(function(index, node) {
				var id = $(node).attr('id');
				nodeIds[id] = true;
			});
		}
	}
};


/**
 * Programmatically closes and destroys the elements of a dialog that was previously
 * loaded through a ui:loadable.
 * @param loadId  the id of the loadable surrounding the dialog
 */
swa.closeDialog = function(loadId) {
	var div = $('#div-' + loadId);
	div.dialog("destroy");
	div.remove();
};


/**
 * Closes the currently open progress monitor dialog, if it exists.
 */
swa.closeProgressMonitorDialog = function() {
	if(swa.progressMonitorDialog) {
		swa.progressMonitorDialog.dialog('close');
		swa.progressMonitorDialog = null;
	}
};


/**
 * Called when the dialog opened by a CreateResourceButton is OKed.
 * @param typeURI  the URI of the class to instantiate
 * @param resourceURI  the URI of the resource to create
 * @param label  the label of the new resource
 * @param labelLang  the (optional) language of the label
 * @param handlerURI  the URI of the create handler (SWP view class) to call on completion 
 * @param contextResourceURI  an optional URI such as superclass, passed to the web service
 * @param resourceSelectedEvent  the name of an optional event to publish the new URI under when done 
 */
swa.createResource = function(typeURI, resourceURI, label, labelLang, contextResourceURI, handlerURI, resourceSelectedEvent) {
	swa.createResourceHelper(typeURI, resourceURI, label, labelLang, contextResourceURI, handlerURI, resourceSelectedEvent);
};


swa.createResourceHelper = function(typeURI, resourceURI, label, labelLang, contextResourceURI, handlerURI, resourceSelectedEvent, andThen) {
	var metadata = {
		createdResource : resourceURI	
	};
	var params = {
			'metadata' : JSON.stringify(metadata),
			'resourceType' : '<' + typeURI + '>',
			'uri' : '"' + resourceURI + '"',
			'labelLang' : labelLang
	};
	if(label && label.length > 0) {
		params.label = '"' + label + '"';
	}
	if(contextResourceURI) {
		params.contextResource = '<' + contextResourceURI + '>'
	}
	params['_base'] = swa.queryGraphURI;
	params['_format'] = 'json';
	params['_snippet'] = true;
	params['_viewClass'] = handlerURI;
	$.get(swa.servlet, params, function(data) {
		if(data.error) {
			alert('Operation failed: ' + data.error);
		}
		else {
			if(andThen) {
				andThen(resourceURI);
			}
			else {
				swa.processEdits(data, true);
			}
			if(resourceSelectedEvent) {
				gadgets.Hub.publish(resourceSelectedEvent, resourceURI);
			}
		}
	});
};


/**
 * Called when the user clicks the Delete button on an editable form.
 * @param resourceURI  the URI of the resource to delete
 */
swa.deleteResource = function(resourceURI) {

	var progressId = 'swa-delete-collect' + Math.random();
	swa.openProgressMonitorDialog(progressId, 'Collecting deletable statements for ' + resourceURI);

	// Call confirm handler
	var params = {
			_base : swa.queryGraphURI,
			_format : 'json',
			_progressId : progressId,
			_snippet : true,
			_viewClass : 'swa:ConfirmDeleteResourceHandler',
			resource : '<' + resourceURI + '>'	
	};
	$.get(swa.server + swa.servlet, params, function(data) {
		swa.closeProgressMonitorDialog();
		if(confirm(data.message + " This will delete " + data.tripleCount + " statements.")) {

			var progressId2 = 'swa-delete-resource' + Math.random();
			swa.openProgressMonitorDialog(progressId2, 'Deleting statements for ' + resourceURI);
			
			// Execute the actual deletion if confirmed
			var params2 = {
					_base : swa.queryGraphURI,
					_format : 'json',
					_progressId : progressId2,
					_snippet : true,
					_viewClass : 'swa:DeleteResourceHandler',
					resource : '<' + resourceURI + '>'	
			};
			$.get(swa.server + swa.servlet, params2, function(data) {
				if(data && data.warning) {
					alert(data.warning);
				}
				swa.handleResourceDeleted(resourceURI, data);
			});
		}
	});
};


/**
 * Called when the user clicks delete to delete a row from a widget.
 * This completely deletes the element with the given id.
 * The hidden fields to instruct the server that the given object
 * shall be deleted are kept, and moved under the parent of the row. 
 * The function also makes sure that the add button is visible.
 * @param id  the id of the element to delete
 */
swa.deleteRow = function(id) {
	var row = $('#' + id);
	
	var pp = row.parent().parent().parent();
	pp.find('.swa-add-button-div').each(function(index, item) {
		$(item).removeClass('swa-display-none');
		$(item).addClass('swa-icon');
	});
	
	row.find('.swa-editor-hidden-field').appendTo(row.parent());
	row.remove();
};


/**
 * Makes a server callback to invoke ui:deleteSessionGraph for the given graph.
 * @param graphURI  the URI of the session graph to delete
 */
swa.deleteSessionGraph = function(graphURI) {
	var params = {
		_viewClass : 'swa:DeleteSessionGraphService',
		sessionGraph : '<' + graphURI + '>'
	};
	$.get(swa.servlet, params);
};


/**
 * Helper function similar to String.endsWith in Java.
 * @param str  the string to search in
 * @param suffix  the expected end
 * @returns true if str ends with suffix
 */
swa.endsWith = function(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
};


/**
 * Called when the user executes a template call from the swa:TemplateCallDialog.
 * @param loadId  the loadId surrounding the form
 * @param templateGraphURI  the URI of the graph containing the template's definition
 */
swa.executeTemplateCall = function(loadId, templateGraphURI) {
	var formId = loadId + '-form';
	var params = {};
	$.each($('#' + formId).serializeArray(), function(_, kv) {
	    params[kv.name] = kv.value;
	});
	//params['_base'] = ''; // 'http://uispin.org/ui#graph';
	$.post(swa.server + swa.servletURL('swpCreateParams'), params, function(data) {
		if(data && data.errors) {
			var msg = data.errors.length + ' Constraint violations:';
			$.each(data.errors, function(index, item) {
				msg += '\n - ' + item.message;
			});
			swa.updateFormErrors($('#' + formId), data.errors);
			alert(msg);
		}
		else {
			swa.updateFormErrors($('#' + formId), []);
			data.template = data.type;
			data.templateGraph = '<' + templateGraphURI + '>';
			delete data.type;
			swa.load(loadId + '-results', data);
		}
	});
};


/**
 * Called when the user executes a ResourceAction that does not have an onSelect
 * action but is declared as SWP element instead.  This does not do anything by
 * default but can be overloaded, e.g. as done by EVN.
 * @param handlerName  the qname of the handler (ResourceAction)
 * @param resourceURI  the URI of the concept to clone
 */
swa.executeSWPResourceAction = function(handlerName, resourceURI) {
	// Needs to be overloaded, e.g. as done for EVN
};


/**
 * Runs the SPARQL query behind the Search form and produces a spreadsheet.
 * @param formId  the id of the search form
 * @param format  'csv' or 'tsv'
 */
swa.exportSearchResults = function(formId, format) {
	var form = $('#' + formId);
	var params = form.serialize() + swa.serializeKeyProperties(form);
	window.open(swa.server + 'getSearchResults?_format=' + format + '&' + params, '_blank');
};


swa.getCookie = function(key, defaultValue) {
	var value = $.cookie(key);
	if(value != null) {
		return value;
	}
	else {
		return defaultValue;
	}
};


/**
 * Gets the URI of the resource currently displayed by a given form.
 * This uses a 'magic' attribute at the form's HTML element.
 * @param formId  the id of the form
 * @return the resource
 */
swa.getFormResourceURI = function(formId) {
	return $('#' + formId).attr('resource');
};


/**
 * Returns the current data item for given grid row.
 * @param gridObject  the grid object
 * @param rowId  the id of the row
 * @returns the data item
 */
swa.getGridDataItem = function(gridObject, rowId) {
	var page = $(gridObject).jqGrid('getGridParam', 'page');
	var rowsPerPage = $(gridObject).jqGrid('getGridParam', 'rowNum');
	var dataIndex = parseInt((page - 1) * rowsPerPage) + parseInt(rowId) - 1;
	return $(gridObject).jqGrid('getGridParam', 'data')[dataIndex];
};


/**
 * Gets all properties that are already used as widgets on a given form.
 * @param form  a jQuery form object
 * @returns an associative array in which the keys are the property URIs, values: true
 */
swa.getPropertiesUsedOnForm = function(form) {
	var result = {};
	form.find(".swa-property-label").each(function(index, element) {
		var id = $(element).attr('id');
		if(id && id.indexOf('property-label-') == 0) {
			var uri = id.substring(15);
			result[uri] = true;
		}
	});
	return result;
};


swa.getRunningIndex = function() {
	return swa.templateCallDialogCounter++;
};


/**
 * Gets the string of parameters sent to the server when the user hits Search.
 * The algorithm eliminates fields that are not filled out, and their dependants. 
 * @param formId  the id of the form to get the parameters from
 * @returns the param string
 */
swa.getSearchParamsFromForm = function(formId) {
	var form = $('#' + formId);
	var pairs = form.serializeArray();
	
	// Collect a set of all facets without a value 
	var emptyIds = {};
	$.each(pairs, function() {
		if(this.value == undefined || this.value == '') {
			if(this.name.indexOf('regex') == 0 || this.name.indexOf('value') == 0) {
				emptyIds[this.name.substring(5)] = true;
			}
		}
    });

	// Build params string, dropping those entries related to the empty facets from above
	var params = "";
	var serialized = form.serialize();
	var split = serialized.split('&');
	split.forEach(function(entry) {
		var equals = entry.indexOf("=");
		if(equals > 0) {
			var varName = entry.substring(0, equals);
			var index = varName.indexOf('uniqueId');
			if(index <= 0 || !emptyIds[varName.substring(index)]) {
				if(params.length > 0) {
					params += "&";
				}
				params += entry;
			}
		}
		else {
			// I don't think this can happen
			params += "&" + entry;
		}
	});
	
	// Append key properties from check boxes
	var keyPropertiesList = '';
	$.each(form.find('.swa-key-property-input:checked'), function(index, value) {
		var value = $(value).attr('value');
		params += '&keyProperty' + index + '=' + escape(value);
		if(index > 0) {
			keyPropertiesList += ' ';
		}
		keyPropertiesList += value;
	});
	if(keyPropertiesList.length == 0) {
		$.each(form.find('.swaKeyPropertyHiddenField'), function(index, value) {
			var value = $(value).attr('value');
			if(keyPropertiesList.length > 0) {
				keyPropertiesList += ' ';
			}
			keyPropertiesList += value;
		});
	}
	if(keyPropertiesList.length > 0) {
		params += '&keyPropertiesList=' + escape(keyPropertiesList);
	}

	return params;
};


/**
 * Gets the URI of the currently selected resource in a given tree.
 * @param treeId  the id of the tree
 * @returns the URI or null if nothing is selected
 */
swa.getSelectedTreeResource = function(treeId) {
	return $('#' + treeId).jstree('get_selected').attr('resource');
};


swa.getSelectedTreeResourceOrError = function(treeId, error) {
	var resource = swa.getSelectedTreeResource(treeId);
	if(resource) {
		return resource;
	}
	else {
		return error;
	}
};


/**
 * @deprecated use swa.collectAddedTreeNodes combined with swa.refreshTreeNodes
 */
swa.handleAddedTreeNodes = function(predicateURI, subjectChanges, treeId) {
	var resultIds = {};
	swa.collectAddedTreeNodes(predicateURI, subjectChanges, treeId, resultIds);
	swa.refreshTreeNodes(treeId, resultIds);
};


/**
 * Handles a change to see if a given InstancesGridGadget needs to be reloaded.
 * The whole grid is reloaded if a new instance of the type or its sub-classes has
 * been created or deleted (as indicated by changes to rdf:type triples).
 * Future versions of this function could be smarter and only do partial updates
 * if labels have changed etc.
 * @param change  the change data object
 * @param resourceTypeURI  the URI of the type of instances being displayed
 * @param loadId  the loadable to reload
 */
swa.handleChangeForInstancesGrid = function(change, resourceTypeURI, loadId) {

	// Collect objects of all rdf:type triples that were added or deleted
	var types = {};
	for(var subjectURI in change.changes) {
		var subjectChanges = change.changes[subjectURI];
		var added = subjectChanges[rdf.type];
		if(added) {
			for(var objectKey in added) {
				var objectURI = added[objectKey];
				types[objectURI] = true;
			}
		}
		var deleted = subjectChanges["-" + rdf.type];
		if(deleted) {
			for(var objectKey in deleted) {
				var objectURI = deleted[objectKey];
				types[objectURI] = true;
			}
		}
	}
	
	// Concatenate those types into a long, space-separated string
	var typesList = "";
	for(var type in types) {
		typesList += " " + type;
	}
	
	if(typesList.length > 0) {
		
		// Ask server if any of those types is a subclass of resourceType
		var params = {
			_base : swa.queryGraphURI,
			_template : 'http://topbraid.org/swa#TypesHaveSuperClass',
			resourceType : resourceTypeURI,
			typesList : typesList.substring(1) // Ignore first ' '
		}
		$.post('template', params, function(data) {
			if(data['boolean'] == true) {
				swa.loadWithResource(loadId, 'resourceType', resourceTypeURI);
			}
		});
	}
};


/**
 * Called to update a class/property tree when a change event has been published.
 * @param change  the data object describing the change
 * @param treeId  the id of the tree to update
 */
swa.handleChangeForClassPropertyTree = function(change, treeId) {

	swa.updateTreeLabels(treeId, change);
	
	var nodeIds = {};
	
	// Handle rdfs:subClassOf triples like the class tree does
	swa.collectChangesForClassTree(change, treeId, nodeIds);
	
	for(var subjectURI in change.changes) {
		var subjectChanges = change.changes[subjectURI];
		
		// Changed rdfs:domain triples
		swa.collectAddedTreeNodes(rdfs.domain, subjectChanges, treeId, nodeIds);
		swa.collectDeletedTreeNodes(rdfs.domain, subjectChanges, treeId, nodeIds);
	}

	swa.handleChangeForTreeHelper(change, treeId, nodeIds);
};


/**
 * Called to update a class tree when a change event has been published.
 * @param change  the data object describing the change
 * @param treeId  the id of the tree to update
 */
swa.handleChangeForClassTree = function(change, treeId) {
	swa.updateTreeLabels(treeId, change);
	var nodeIds = {};
	swa.collectChangesForClassTree(change, treeId, nodeIds);
	swa.handleChangeForTreeHelper(change, treeId, nodeIds);
};


/**
 * A helper that can be called from tree change handlers.
 * In a typical scenario, handlers walk through a change object to collect
 * all nodes that need refreshing.  Then it triggers a refresh.
 * However, the tree may also want to highlight a newly created node,
 * and this can only happen after all tree nodes have been updated.
 * This function implements the latter aspects of the logic uniformly. 
 * @param change  the change object from the server
 * @param treeId  the tree id
 * @param nodeIds  the collection of node ids to refresh
 */
swa.handleChangeForTreeHelper = function(change, treeId, nodeIds) {
	var count = 0;
	for (i in nodeIds) {
	    count++;
	}
	if(count > 0) {
		if(change.metadata && change.metadata.createdResource) {

			// If it's a new tree node then make sure it's selected after everything has been loaded 
			
			// Note that the ajaxStop trick below is rather fragile - a better solution would involve
			// using jQuery.when but jsTree does not create the necessary Promise objects
			$(document).one("ajaxStop", function() {
				swa.selectTreeNode(treeId, change.metadata.createdResource);
			});
			swa.refreshTreeNodes(treeId, nodeIds);
		}
		else {
			swa.refreshTreeNodes(treeId, nodeIds);
		}
	}
};


/**
 * Called to trigger a reload of the form if one of the changes contains
 * the currently displayed resource of the form.
 * @param change  the data object describing the change
 * @param formId  the id of the form
 * @param windowId  the id of the surrounding window
 */
swa.handleChangeForSwitchableFormGadget = function(change, formId, windowId) {
	if(!change['formAlreadyReloaded-' + formId]) { // Don't do anything if the event was triggered by Save Changes button
		
		var resourceURI = swa.getFormResourceURI(formId);
		if(change.changes[resourceURI]) { // If we have any change on the current subject
			swa.switchToViewForm(formId); // Trigger a reload
		}
		
		if(change.metadata && change.metadata.createdResource) {
			// Reload form's window in editing mode
			var params = {
				editing : true,
				resource : '<' + change.metadata.createdResource + '>'	
			};
			swa.load(windowId, params);
		}
	}
};


/**
 * @deprecated see swa.handleAddedTreeNodes
 */
swa.handleDeletedTreeNodes = function(predicateURI, subjectChanges, treeId) {
	var nodeIds = {};
	swa.collectDeletedTreeNodes(predicateURI, subjectChanges, treeId, nodeIds);
	swa.refreshTreeNodes(treeId, nodeIds);
};


/**
 * Used by ui:handle - do not call directly.
 * @param parentId  the id of the 'parent' node
 * @param uistate  the state of the UI
 * @param thenLoadId  the optional value of ui:thenLoadId
 */
swa.handleEvent = function(parentId, uistate, thenLoadId) {
	var params = uistate + '&_snippet=true';
	var parent = $('#' + parentId);
	var callback = null;
	if(thenLoadId) {
		callback = function() {
			swa.load(thenLoadId);
		};
	}
	parent.load(swa.server + swa.servlet, params, callback);
};


swa.handleResourceDeleted = function(resourceURI, data) {
	swa.processEdits(data);
};


/**
 * Called when the user has completed a drag and drop in a tree.
 * This function doesn't do anything by default and needs to be "overloaded"
 * by applications that support tree drag and drop.
 * A typical implementation would execute an edit operation on the server,
 * and roll back the tree UI if the operation failed for any reason.
 * @param parentURI  the URI of the (new) parent resource
 * @param childURI  the URI of the (new) child resource
 * @param rollBack  a rollback object (see below)
 */
swa.handleTreeMove = function(parentURI, childURI, rollBack) {

	// console.log('Moving: ' + childURI + ' under ' + parentURI);
	
	/* If you want to roll back:
	jQuery.jstree.rollback(rollBack);
	alert('this move is not allowed');
	*/
};


/**
 * Generates a properly escaped selector for an id.
 * Note: unclear if this works, see http://mothereff.in/css-escapes#search_form%3Aexpression
 * @param str  the id of the element to escape
 * @returns the escaped Id, starting with '#'
 */
swa.idSelector = function(str) {
	return '#' + str.replace(/(:|\.)/g,'\\$1');
}


/**
 * Turns an input element with a given id into a jQuery auto-complete.
 * The actually selected resource will be returned to the server with
 * a hidden field that needs to be passed into this function as well.
 * @param id  the id of the visible input element
 * @param hiddenId  the id of the hidden field
 * @param link  the link for the server callback
 * @param onSelect  an optional handler if selected
 */
swa.initAutoComplete = function(id, hiddenId, link, onSelect) {
	
	link = swa.redirectLink(link);
	
	$('#' + id).autocomplete({
		change : function() {
			if(hiddenId && hiddenId != '') {
				var text = $('#' + id).val();
				if(text && text.length == 0) {
					// Reset hidden field if main field gets emptied
					$('#' + hiddenId).val('');				
				}
			}
		},
		dataType : 'json',
		position : {
			collision: "flip flip"
		},
		source : link,
		select : function(event, ui) {
			if(hiddenId && hiddenId != '') {
				$('#' + hiddenId).val('<' + ui.item.resource + '>');
				var label = ui.item.editLabel ? ui.item.editLabel : ui.item.label;
				$('#' + hiddenId).attr('swa-label', label);
				$('#' + id).removeClass('swa-auto-complete-dirty');
			}
			if(onSelect) {
				var resource = ui.item.resource;
				var label = ui.item.label;
				eval(onSelect);
			}
			if(ui.item.editLabel) {
				$('#' + id).val(ui.item.editLabel);
				event.preventDefault();
			}
		}
	});
	if(hiddenId && hiddenId != '') {
		$('#' + id).keyup(function() {
			var hiddenLabel = $('#' + hiddenId).attr('swa-label');
			if(!hiddenLabel || hiddenLabel != $('#' + id).val()) {
				$('#' + id).addClass('swa-auto-complete-dirty');
			}
			else {
				$('#' + id).removeClass('swa-auto-complete-dirty');
			}
		});
	}
};


/**
 * Turns an input element with a given widget id into a jQuery datepicker.
 * @param id  the uid of the widget
 * @param altId  (optional) the id of the hidden widget
 */
swa.initDatePicker = function(id, altId) {
	if(!altId) {
		altId = 'new-' + id;
	}
	var eid = '#dateEditor' + id;
	$(eid).datepicker({ 
		altField: '#' + altId, 
		altFormat: 'yy-mm-dd', 
		dateFormat: 'yy-mm-dd'
	});
	
	// Work-around to bug: Make sure that hidden field is cleared if field is empty 
	$(eid).change(function() {
		if('' == $(eid).val()) {
			$('#' + altId).val('');
		}
	});
};


/**
 * Sets up a listener to a given input field so that whenever it changes
 * a new local name will be generated in the URI field.
 * Used by the CreateResourceDialog.
 * @param inputId  the id of the label input field
 */
swa.initCreateResourceLabelField = function(inputId) {
	$('#' + inputId).keyup(function() {

		// Note: finding the URI field by id 'uri-field' for some reason does not work
		//       Should be an argument really.
		var uriField = $('.swa-uri-field');
		var old = uriField.val();
		var sep = old.lastIndexOf('#');
		if(sep < 0) {
			sep = old.lastIndexOf('/');
		}
		var label = $('#' + inputId).val().split(' ').join('_'); // Replace ' ' with '_'
		var localName = encodeURIComponent(label);
		var ns = sep < 0 ? 'http://example.org/' : old.substring(0, sep + 1);
		var neo = ns + localName;
		uriField.val(neo);
	});
	$('#' + inputId).keydown(function(event) {
		if (event.which == 13) {
			$('#createResourceDialogOkButton').click();
		}
	});
;};


/**
 * Turns a div created by swa:Tree into a jsTree.
 * @param id  the id of the div
 * @param link  the URL of the callback for the JSON data
 * @param onLoaded  the event handler for after the tree has been loaded
 * @param onSelect  the event handler for when the selection changes
 * @param onDoubleClick  the event handler for double-clicks on a node
 * @param draggable  true to make the tree draggable
 */
swa.initTree = function(id, link, onLoaded, onSelect, onDoubleClick, draggable) {
	
	link = swa.redirectLink(link);
	
	var plugins = draggable ? 
			[ "themes", "json_data", "dnd", "crrm", "ui" ] :  
			[ "themes", "json_data", "ui" ];
	if (swa.server != '') {
		link += '&_server=' + escape(swa.server);
	}
	var params = {

		"plugins" : plugins,
	
		"json_data" : {
			"ajax" : {
				"url" : link,
				"async" : true,
				"data" : function(n) {
					return {
						"id" : n.attr ? n.attr("id").replace("node_", "") : 1,
						"_bypassCacheDummy" : new Date().getTime()
					};
				}
			}
		},

		"core" : {
			"animation" : 0
		},

		"themes" : {
			"theme" : "classic"
		},

		"ui" : {
			"select_limit" : 1
		}
	};
	
	if(draggable) {
		params["crrm"] = { 
			"move" : {
				"check_move" : function (m) { 
					if(m.p == "before" || m.p == "after") {
						return false;
					}
					else if(m.o.attr('movable')=='true') {
						return true;
					}
					else {
						return false;
					}
				}
			}
		};
	}
	
	$("#" + id).jstree(params);
	
	if(draggable) {
		$('#' + id).bind('move_node.jstree', function(event, data) {
			swa.handleTreeMove(data.rslt.np.attr('resource'), data.rslt.o.attr('resource'), data.rlbk);
		});
	}
	
	if(onSelect) {
		$("#" + id).bind("select_node.jstree", function(event, data) {
			var node = data.rslt.obj.attr("id");
			var resource = data.rslt.obj.attr("resource");
			eval(onSelect);
		});
	}
	
	if(onDoubleClick) {
		$("#" + id).bind("dblclick.jstree", function(event, data) {
			var node = $(event.target).closest("li");
			var resource = node.attr("resource");
			eval(onDoubleClick);
		});
	}
	
	if(onLoaded) {
		$("#" + id).bind("loaded.jstree", function(event, data) {
			eval(onLoaded);
		});
	}
};


/**
 * Loads and opens a modal dialog via a callback to the server.
 * The prerequisite of this call is a (dummy) div that can hold the
 * dialog's element after they have been loaded.  From there, the
 * system will turn them into a dialog with given dimensions.
 * @param viewClass  the qname of the view class
 * @param loadId
 * @param params
 * @param width
 * @param height
 */
swa.loadModalDialog = function(viewClass, loadId, params, width, height) {
	params['_viewClass'] = viewClass;
	params['_snippet'] = true;
	if(!params['_base'] && swa.queryGraphURI) {
		params['_base'] = swa.queryGraphURI;
	}
	$('#swa-dialog-parent').load(swa.server + swa.servlet, params, function(data) {
		swa.openModalDialogHelper(loadId, width, height, null, true);
	});	
};


/**
 * Displays a progress dialog and then starts navigating to another page.
 * @param url  the URL to load
 * @param title  the title of the progress dialog
 */
swa.loadPageWithProgress = function(url, title) {
	var progressId = 'load-page-' + Math.random();
	swa.openProgressMonitorDialog(progressId, title);
	document.location.href = url + '&_progressId=' + progressId;
};


// Private
swa.loadPostProcessAll = function(e) {
	swa.loadPostProcess(e, 'north');
	swa.loadPostProcess(e, 'east');
	swa.loadPostProcess(e, 'south');
	swa.loadPostProcess(e, 'west');
	swa.loadPostProcess(e, 'center');
};


// Private function to make sure that the scrollbars are
// updated if a ui:loadable has been loaded into a layout pane
swa.loadPostProcess = function(e, pane) {
	// TODO: Test if this also works for panes that don't have a ui-layout-content
	if(e.hasClass('ui-layout-' + pane)) {
		e.parent().layout().initContent(pane);
	}
};


/**
 * Loads a SearchResultsGrid based on the selections in a form with
 * a given id.  Will replace the content of a given target element.
 * @param formId  the form id
 * @param targetId  the target id
 * @param onSelect  the value for onSelect of the generated grid
 * @param rowNumCookie  the rowNumCookie value to pass into the grid 
 */
swa.loadSearchResultsGrid = function(formId, targetId, onSelect, rowNumCookie) {
	var params = swa.getSearchParamsFromForm(formId);
	swa.loadSearchResultsGridHelper(params, targetId, onSelect, rowNumCookie);
};


swa.loadSearchResultsGridHelper = function(params, targetId, onSelect, rowNumCookie) {
	var escaped = '&params=' + escape(params);
	if(onSelect) {
		escaped += '&onSelect=' + escape(onSelect);
	}
	swa.insertLoadingIndicator($('#' + targetId));
	params += '&_viewClass=swa:SearchResultsGrid&_snippet=true' + escaped;
	if(rowNumCookie) {
		params += '&rowNumCookie=' + rowNumCookie;
	}
	$.post(swa.server + swa.servlet, params, function(data) {
		$('#' + targetId).html(data);
		swa.loadPostProcessAll($('#' + targetId).parent());
	});
};


/**
 * Runs the SPARQL query behind the Search form and builds an array
 * consisting of the URIs of the matching resources.
 * Then it runs a callback function that takes that array and the id of the
 * selected type as its two arguments.
 * @param formId  the id of the search form
 * @param maxCount  the maximum number of matches before stopping with an error
 * @param callback  the callback to invoke once the search results came back
 */
swa.loadSearchResultsList = function(formId, maxCount, callback) {
	var form = $('#' + formId);
	var typeField = form.find('[name="type"]');
	var type = typeField.val();
	var params = form.serialize() + swa.serializeKeyProperties(form);
	if(maxCount && maxCount >= 0) {
		params += '&maxCount=' + maxCount;
	}
	$.post(swa.server + 'getSearchResults', params, function(data) {
		var rows = data.rows;
		if(maxCount && rows.length == maxCount) {
			alert('Too many search results: this operation is not supported for more than ' + maxCount + ' matches.');
		}
		else {
			var array = [];
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i];
				var uri = row.id;
				array[i] = uri;
			}
			callback(array, type);
		}
	});
}


/**
 * (Re)loads the content of a swa:Window with a given id.
 * Clients should use swa.load instead because it will automatically invoke the method below.
 * @param windowId  the id of the swa:Window to reload
 * @param args  name-value pairs of variables that shall be set when reloading
 * @param callback  an optional callback after loading
 */
swa.loadWindow = function(windowId, args, callback) {
	var e = $('#' + windowId);
	var base = e.attr('uistate');
	if(!base) {
		alert('Error: Invalid use of swa.reloadWindow: Missing uistate attribute at ' + windowId);
		return;
	}
	
	// Unsubscribe from any event this window has subscribed to before.
	// Note this function is currently implemented in swawindows.js.
	swa.unsubscribeWindow(windowId);
	
	var params = base;
	if(args) {
		var c = {};
		for(var key in args) {
			c['_scope' + key] = args[key];
		}
		var p = jQuery.param(c);
		params = p + "&" + base;
	}
	params += '&_snippet=true';

	// Replace everything but the head with a loading indicator
	e.children().each(function() {
		if(!$(this).hasClass("swa-header")) {
			$(this).remove();
		}
	});
	var div = $('<div class="swa-loading-indicator"></div>');
	e.append(div);
	
	// Some of this code is copied from jQuery.load
	jQuery.ajax({
		url: swa.servlet,
		type: "POST",
		dataType: "html",
		data: params,
		complete: function( jqXHR, status, responseText ) {
			responseText = jqXHR.responseText;
			if (jqXHR.isResolved()) {
				jqXHR.done(function(r) {
					responseText = r;
				});
				div.remove(); // Remove temp placeholder
				var neo = $(responseText);
				e.append(neo); // Insert all so that the scripts get executed too
				
				// Move all children except header under new parent
				$(neo).children().each(function() {
					if($(this).hasClass("swa-header")) {
						$(this).remove();
					}
					else {
						e.append($(this));
					}
				});
				neo.remove();
			}
			swa.loadPostProcessAll(e);
			if(callback) {
				callback.call();
			}
		}
	});
};


/**
 * Changes the location (URL) of the current browser window to the
 * URL of the uispin servlet with the default view of a given resource
 * and a given context graph
 * @param resourceURI  the URI of the resource to navigate to
 * @param queryGraphURI  the URI of the current query graph
 * @return false
 */
swa.navigateTo = function(resourceURI, queryGraphURI) {
	window.location = swa.server + swa.servlet + '?_base=' + escape(queryGraphURI) + 
		'&_resource=' + escape(resourceURI);
};


/**
 * Opens a new tab or browser window with the URL of the uispin servlet
 * with the default view of a given resource and a given context graph
 * @param resourceURI  the URI of the resource to navigate to
 * @param queryGraphURI  the URI of the current query graph
 */
swa.navigateToInTab = function(resourceURI, queryGraphURI) {
	window.open(swa.server + swa.servlet + '?_base=' + escape(queryGraphURI) + 
		'&_resource=' + escape(resourceURI));
};


// Helper for resource actions and similar drop downs
swa.openActionsMenuHelper = function(parentId, data, queryGraphURI, resourceURI, defaultCallback, evalCallback) {
	$.get(swa.server + swa.servlet, data, function(bindings) {
		if(bindings.length > 0) {
			var items = {};
			for (var i = 0; i < bindings.length; i++) {
				var b = bindings[i];
				var item = {
					actionJS: b.onSelect,
					actionName : b.actionName,
					name: b.label,
					icon: b.iconClass
				};
				if(!b.enabled) {
					item.disabled = true;
				}
				if(b.actionLocalName) {
					item.className = 'test-' + b.actionLocalName;
				}
				items['item' + i] = item;
			};
		    $.contextMenu({
		        selector: '#' + parentId,
		        items : items,
				callback: function(key, e) {
					var b = e.commands[key];
					if(b.actionJS) {
						if(evalCallback) {
							evalCallback(b.actionJS);
						}
						else {
							eval(b.actionJS);
						}
					}
					else if(defaultCallback) {
						defaultCallback(b.actionName);
					}
				}
		    });
		    $('#' + parentId).contextMenu(true);
		    $('#' + parentId).contextMenu();
		}
	});
};


/**
 * Called when the user clicks the drop down menu behind an auto-complete.
 * @param id  the id used by the auto-complete 
 * @param typeURI  the type of instances to select
 * @param appName  the app name from the context
 */
swa.openAutoCompleteSelectMenu = function(id, typeURI, appName) {
	var params = {
		_base : swa.queryGraphURI,
		_viewClass : 'swa:AutoCompleteSelectMenuCallback',
		elementId : '"' + id + '"',
		type : '<' + typeURI + '>'
	};
	if(appName && appName != '') {
		params['_contextswaAppName'] = '"' + appName + '"';
	}
	swa.openActionsMenuHelper(id + "-menu", params, swa.queryGraphURI);
};


/**
 * Called when the user clicks on a swa:CreateResourceButton.
 * @param loadId  the id of the dialog to open
 * @param contextResource  the (optional) URI of a context resource, e.g. tree parent
 *                         or false to indicate that no contextResource is needed
 *                         or an error string starting with "Error: " to display
 *                         a dialog only
 */
swa.openCreateResourceDialog = function(loadId, contextResource) {
	if(contextResource && contextResource.indexOf('Error:') == 0) {
		alert(contextResource.substring(contextResource.substring(7)));
	}
	else {
		var params = { };
		if(contextResource != false && contextResource != null) {
			params.contextResource = '"' + contextResource + '"';
		}
		swa.openModalDialog(loadId, params, 600, 180);
	}
};


/**
 * Can be used to implement on-the-fly creation of instances for auto-complete fields.
 * Used by EVN Ontology Editor.
 * @param elementId  the id used by the auto-complete
 * @param typeURI  the URI of the resource type
 */
swa.openCreateResourceForAutoCompleteDialog = function(elementId, typeURI) {
	var loadId = 'myCreateResourceDialog' + swa.getRunningIndex();
	var params = {
		callback: "swa.openCreateResourceForAutoCompleteDialogHelper",
		loadId: '"' + loadId + '"', 
		resourceType: '<' + typeURI + '>',
		_base: '<' + swa.queryGraphURI + '>'
	};
	swa.nextAutoCompleteElementId = elementId; // Ugly global hack
	swa.loadModalDialog('swa:CreateResourceDialog', loadId, params, 600, 180);
};

swa.nextAutoCompleteElementId = null;

swa.openCreateResourceForAutoCompleteDialogHelper = function(typeURI, resourceURI, label, labelLang, contextResourceURI, handlerURI, resourceSelectedEvent) {
	swa.createResourceHelper(typeURI, resourceURI, label, labelLang, contextResourceURI, "swa:CreateResourceHandler", resourceSelectedEvent, function(resourceURI) {
		swa.setAutoCompleteResource(swa.nextAutoCompleteElementId, resourceURI);
	});
};


/**
 * Called when the user opens up a drop down menu next to a search widget.
 * @param buttonId  the id of the button (to hold the menu)
 * @param elementId  the id of the div containing the current widget
 * @param typeURI  the URI of the resource type
 * @param predicateURI  the URI of the predicate
 * @param inverse  true if called from a subject widget
 */
swa.openFacetSelectionMenu = function(buttonId, elementId, typeURI, predicateURI, inverse) {
	var data = {
		_base : swa.queryGraphURI,
		_viewClass : inverse ? 'swa:SubjectFacetWidgetsCallback' : 'swa:ObjectFacetWidgetsCallback',
		elementId : '"' + elementId + '"',
		resourceType : '<' + typeURI + '>',
		predicate : '<' + predicateURI + '>'
	};
	swa.openActionsMenuHelper(buttonId, data, swa.queryGraphURI);
};


/**
 * Opens a modal dialog in which the user can enter arguments that will be passed
 * to an swa:EditHandler to perform changes based on those arguments.
 * The handler is assumed to be defined in the UI graph, i.e. a .ui. file in TopBraid.
 * @param title  the title of the dialog
 * @param handler  the qname or <...> URI of the handler
 * @param resourceURI  the selected resource or null
 */
swa.openHandlerDialog = function(title, handler, resourceURI) {
	var loadId = 'myParamDialog';
	var params = {
			callback: "swa.callHandler('" + handler + "', data, null, '" + title + "')",
			label: title, 
			loadId: loadId, 
			resourceType: handler,
			_base: '<' + swa.queryGraphURI + '>'
	};
	if(resourceURI) {
		params.callback = "data['resource']=\"<" + resourceURI + ">\";" + params.callback;
	}
	swa.loadModalDialog('swa:ParamsDialog', loadId, params, 600);
};


// Private
swa.openIndexLetterDialog = function(loadId, letter) {
	swa.load(loadId, { letter: '"' + letter + '"' }, function() {
		var div = $('#div-' + loadId);
		var title = div.attr('title');
		var options = {
				modal: true,
				title: title,
				width: 428,
				height: 330
			};
		div.dialog(options);
	});
};


/**
 * Loads and opens a modal dialog that has been inserted as a ui:loadable.
 * @param loadId  the ui:loadId of the dialog
 * @param params  the parameters to pass into the loadable
 * @param width  (optional) the width in pixels
 * @param height  (optional) the height in pixels
 */
swa.openModalDialog = function(loadId, params, width, height) {
	swa.load(loadId, params, function() {
		swa.openModalDialogHelper(loadId, width, height);
	});
};


// Private
swa.openModalDialogHelper = function(loadId, width, height, buttons, remove) {
	var div = $('#div-' + loadId);
	var title = div.attr('title');
	var options = {
			modal: true,
			title: title
		};
	if(buttons) {
		options.buttons = buttons;
	}
	if(width) {
		options.width = width;
	}
	if(height) {
		options.height = height;
	}
	if(remove) {
		options.close = function() {
			$(this).remove();
		};
	}
	div.dialog(options);
};


/**
 * Runs the search on a given Search form and then passes them into a
 * given multi-resource edit dialog (that must have been inserted somewhere).
 * @param searchFormId  the id of the search form
 * @param dialogId  the id of the dialog that shall be opened
 */
swa.openMultiResourceEditDialog = function(searchFormId, dialogId) {
	swa.loadSearchResultsList(searchFormId, 1000, function(resourceURIs, type) {
		if(resourceURIs.length < 2) {
			alert('Search needs to return at least 2 items. Found ' + resourceURIs.length + ".");
		}
		else {
			var str = "";
			for (var i = 0; i < resourceURIs.length; i++) {
				if(i > 0) {
					str += " ";
				}
				str += resourceURIs[i];
			}
			var params = {};
			params['resourceURIs'] = "\"" + str + "\"";
			params['resourceType'] = type;
			params['_snippet'] = true;
			var e = $('#' + dialogId);
			var base = e.attr('uistate');
			e.load(swa.server + swa.servlet + '?' + base, params, function() {
				swa.openModalDialogHelper(dialogId, 600, 500, [
				    {
				    	text : "Save Changes",
				    	onclick : "swa.submitForm('multiResourceEditForm', 'swpEdit', 'swa.closeDialog(\"" + dialogId + "\");swa.showEditSuccess(data)')"
				    }
				]);
			});
		}
	});
};


/**
 * Opens a ProgressMonitor dialog
 * @param progressId
 * @param message
 */
swa.openProgressMonitorDialog = function(progressId, title, message) {

	var win = $('<div><div class="swa-progress-task" id="swaProgressTask">&nbsp;</div>' +
				'<div class="swa-progress-subtask" id="swaProgressSubTask">&nbsp;</div></div>');
    
	swa.progressMonitorDialog = $(win).dialog({
        'modal' : true,
        'title' : title,
        'width' : '600px',
        'buttons': {
            'Cancel': function() {
                $(this).dialog('close');
            }
        },
        'close' : function() {
        	$(this).remove();
        	var params = {
            		_format : 'json',
            		_snippet : true,
            		_viewClass : 'swa:CancelProgressCallback',
            		id : progressId
            	};
            $.get(swa.server + swa.servlet, params);
        }
    });
	swa.progressMonitorDialogId = progressId;
    
    setTimeout("swa.updateProgressMonitorDialog('" + progressId + "')", 500);
};


/**
 * Loads and opens a context menu for an element with a given id.
 * The provided resourceGetter expression will be evaluated to retrieve
 * the currently selected resource, e.g. the selected tree node.
 * Then it makes a server call-back to retrieve all matching actions
 * for the selected resource (via a SPIN template).
 * @param parentId  the HTML id of the element to attach the menu to
 * @param resourceGetter  an expression that returns a resource URI, null for no menu
 * @param queryGraphURI  the URI of the current query graph
 * @param appName  the name of the current app (if any)
 */
swa.openResourceActionsMenu = function(parentId, resourceGetter, queryGraphURI, appName) {
	$.contextMenu('destroy', '#' + parentId);
	var resourceURI = eval(resourceGetter);
	if(resourceURI) {
		var data = {
			'_base' : queryGraphURI,
			'_viewClass' : 'swa:ResourceActionsCallback',
			'appName' : appName,
			'resource' : resourceURI
		};
		swa.openActionsMenuHelper(parentId, data, queryGraphURI, resourceURI, 
				function(actionName) {
					swa.executeSWPResourceAction(actionName, resourceURI);
				},
				function (expr) {
					eval(expr);
				}
		);
	}
};


/**
 * Opens a resource selection dialog for instances of a given type.
 * Currently simply shows an auto-complete, but future versions may also
 * have a tree with a grid of matching instances.
 * @param typeURI  the URI of the (base) type
 * @param callback  a JavaScript expression that is called on success. The variables
 *                  uri and label will be bound when this expression executes.
 * @param title  an optional title for the dialog
 */
swa.openResourceSelectionDialog = function(typeURI, callback, title) {
	var loadId = 'myParamDialog';
	var params = {
			callback: callback,
			dataGraph: '<' + swa.queryGraphURI + '>',
			loadId: loadId, 
			resourceType: '<' + typeURI + '>',
			_base: swa.queryGraphURI
	};
	if(title) {
		params['label'] = title;
	}
	swa.loadModalDialog('swa:ResourceSelectionDialog', loadId, params, 400);
};


/**
 * Loads and then opens a dialog that was inserted into the current
 * document using swa:ResourceViewDialog.
 * @param loadId  the id of the loadable (same as arg:loadId of the swa:ResourceViewDialog)
 * @param resourceURI  the URI of the resource to display
 * @param width  (optional) the width in pixels
 * @param height  (optional) the height in pixels
 */
swa.openResourceViewDialog = function(loadId, resourceURI, width, height) {
	swa.load(loadId, { resource: '<' + resourceURI + '>' }, function() {
		swa.openModalDialogHelper(loadId, width, height);
	});
};


/**
 * Loads and opens a context menu with all valid SearchResultsActions.
 * @param parentId  the HTML id of the element to attach the menu to
 * @param formId  the id of the form (not used right now)
 * @param appName  the SWA application name
 */
swa.openSearchResultsActionsMenu = function(parentId, formId, appName) {
	$.contextMenu('destroy', '#' + parentId);
	var data = {
		'_base' : swa.queryGraphURI,
		'_viewClass' : 'swa:SearchResultsActionsCallback',
		appName : appName
	};
	swa.openActionsMenuHelper(parentId, data, swa.queryGraphURI, null, null,
			function(expr) {
				eval(expr);
			}
	);
};


/**
 * Opens a modal dialog in which the user can enter arguments of a given SPARQLMotion
 * service.  Ok will execute the SM service.  
 * The script must be defined in a .sms. file that is also imported by a .ui. file,
 * so that the script is part of the globally registered SWP graphs.
 * The file may also have a double ending such as .sms.ui.ttl
 * @param title  the title of the dialog
 * @param script  the qname of the script (for sparqlmotion servlet)
 * @param callback  a JavaScript expression that shall be evaluated after the
 *                  script completed: can access the result of the script as 'data'. 
 */
swa.openSPARQLMotionDialog = function(title, script, callback) {
	var loadId = 'myParamDialog';
	var params = {
			callback: "swa.callSPARQLMotionScript('" + script + "', data, '" + callback + "')",
			dataGraph: '<' + swa.queryGraphURI + '>',
			label: title, 
			loadId: loadId, 
			resourceType: script,
			_base: 'http://uispin.org/ui#graph'
	};
	swa.loadModalDialog('swa:ParamsDialog', loadId, params, 600);
};


swa.templateCallDialogCounter = 0;


/**
 * Opens a swa:TemplateCallDialog that can be used to execute available templates. 
 * @param templates  the URI of a SPIN template that delivers the available templates
 * @param selectedResourceURI  the URI of a selected resource to pre-populate the argument forms (optional)
 * @param callback  a JS script that shall be called if the user selects a match in the results
 */
swa.openTemplateCallDialog = function(templates, treeDataProvider, selectedResourceURI, callback) {
	var loadId = 'templateCallDialog' + swa.templateCallDialogCounter++;
	var params = {
			callback: '"' + callback + '"',
			loadId: loadId, 
			templates: '<' + templates + '>',
			treeDataProvider : '<' + treeDataProvider + '>',
			_base: swa.queryGraphURI,
			_viewClass: 'swa:TemplateCallDialog',
			_snippet: true
	};
	if(selectedResourceURI) {
		params.selectedResource = '<' + selectedResourceURI + '>';
	}
	$('#swa-dialog-parent').load(swa.server + swa.servlet, params, function(data) {
		var div = $('#div-' + loadId);
		var title = div.attr('title');
		var options = {
				modal: false,
				title: title,
				width: 600,
				height: 500
		};
		div.dialog(options);
	});	
};


/**
 * Called when the user clicks on the selection button next to the drop down
 * of the template call dialog.
 * @param treeDataProvider  the URI of a TreeDataProvider for the tree
 * @param selectId  the id of the select that shall be updated when OK clicked
 */
swa.openTemplateSelectionDialog = function(treeDataProvider, selectId) {
	var loadId = 'myTemplateSelectionDialog';
	var params = {
			loadId: loadId, 
			selectId : selectId,
			treeDataProvider : '<' + treeDataProvider + '>'
	};
	swa.loadModalDialog('swa:TemplateSelectionDialog', loadId, params, 700);
};


/**
 * Makes sure that all roots of a given tree are opened.
 * Can be used as callback arg:onLoaded.
 * @param treeId  the id of the tree to open
 */
swa.openTreeRoots = function(treeId) {

	var tree = $('#' + treeId);

	tree.children("ul").children("li").each(function(i, o) {
		var child = $(o);
		tree.jstree('open_node', child);
	});
};


/**
 * Called when the user clicks the Search button under the FormSearchGadget.
 * Converts the name-value pairs from the search form into a search:Search RDF instance
 * and then publishes an event to notify the result displays.
 * @param formId  the id of the search form
 * @param searchGraphURI  the session graph to write to
 * @param searchEvent  the search event to publish
 */
swa.performSearchFormSearch = function(formId, searchGraphURI, searchEvent) {
	var params = swa.getSearchParamsFromForm(formId);
	params += "&searchGraph=" + searchGraphURI;

	$.post(swa.servletURL('createSearchRDF'), params, function() {
		gadgets.Hub.publish(searchEvent, searchGraphURI);
	});
};

/**
 * Called when edits have been made.  Takes the server response JSON
 * as argument, and publishes it as an event "org.topbraid.swa.change"
 * to the event hub.
 * @param data  the data from the server
 * @param fromForm  true if this has been called from a form (which has
 *                  already been refreshed)
 */
swa.processEdits = function(data, fromForm) {
	
	// Legacy code for EVN
	if(swa.onEdit) {
		swa.onEdit(data, fromForm);
	}
	
	// Publish edits as an event to the Hub
	if(typeof gadgets != 'undefined' && gadgets.Hub) {
		gadgets.Hub.publish("org.topbraid.swa.change", data);
	}
};


swa.promptLogMessage = function(params, onSuccess, servlet, formId) {

	var win = $('<div>' +
				'<div>Please enter a log message:</div>' +
				'<div><textarea id="swaLogMessageTextArea" rows="4" style="width:570px"/></div>' +
				'</div>');

	var dialog = $(win).dialog({
        'modal' : true,
        'title' : 'Saving Changes',
        'width' : '600px',
        'buttons': {
        	'Ok' : function() {
        		var message = $('#swaLogMessageTextArea').val();
                $(this).dialog('close');
        		if(message != '') {
        			params += '&_logMessage=' + escape(message);
        		}
        		swa.submitEdits(params, onSuccess, servlet, formId);
        	},
            'Cancel': function() {
                $(this).dialog('close');
            }
        },
        'close' : function() {
        	$(this).remove();
        }
    });
};


/**
 * Makes sure that a link (generated with ui:createLink) redirects to the swa.servlet.
 * @param link  the link to redirect
 * @returns a new link
 */
swa.redirectLink = function(link) {
	// If necessary, make URL absolute
	if(link.indexOf('swp?') == 0) {
		return swa.servlet + link.substring(3);
	}
	else {
		return link;
	}
};


/**
 * Reloads a given tree completely.
 * @param treeId  the id of the tree
 */
swa.refreshTree = function(treeId) {
	var tree = jQuery.jstree._reference("#" + treeId);
	tree.refresh();
};


/**
 * Reloads a given tree node.
 * @param treeId  the id of the tree
 * @param nodeId  the (unescaped!) id of the tree node
 */
swa.refreshTreeNode = function(treeId, nodeId) {
	var tree = jQuery.jstree._reference("#" + treeId);
	var jn = document.getElementById(nodeId);
	var node = tree._get_node(jn);
	tree.refresh(node);
};


/**
 * Refreshes a number of nodes of a given tree.
 * @param treeId  the id of the tree to refresh
 * @param nodeIds  an object where the keys are the ids of the nodes to refresh
 */
swa.refreshTreeNodes = function(treeId, nodeIds) {
	for(var nodeId in nodeIds) {
		swa.refreshTreeNode(treeId, nodeId);
	}
};


// private
swa.reloadSearchForm = function(loadId) {
	var data = {};
	$('#' + loadId + '-typeSelect').each(function() {
		data.resourceType = '<' + $(this).val() + '>';
	});
	swa.load(loadId, data);
};


// private - called from menu items generated in swa:ObjectFacetWidgetsCallback
swa.replaceFacet = function(elementId, widgetURI) {
	$("#facetSelector-" + elementId).removeClass("swa-nested-form-facet-selector");
	swa.loadWithResource(elementId + '-loadable', 'selectedWidget', widgetURI);
};


/**
 * Reloads the type switch of a search form with a given id, e.g.
 * if classes have been changed.
 * @param formId  the id of the form used when creating the swa:SearchForm
 * @param callback  an optional callback after loading
 */
swa.reloadSearchFormTypeSwitch = function(formId, callback) {
	var fun = null;
	if(callback) {
		fun = function() {
			eval(callback);
		}
	}
	swa.load(formId + "TypeSwitch", null, fun);
};


// private
swa.rememberLogMessageBoxStatus = function() {
	swa.logMessageBoxStatus = $('#logMessageBox').is(':checked');
};


//private
swa.restoreLogMessageBoxStatus = function() {
	$('#logMessageBox').attr('checked', swa.logMessageBoxStatus ? 'checked' : null);
};


swa.resizeGrid = function(pane, $Pane, paneState) {
	// TODO: not working well
	/*
	if(grid = $('.ui-jqgrid')) { //}-btable:visible')) {
	    grid.each(function(index) {
	    	var gridId = $(this).attr('id');
	    	$('#' + gridId).setGridWidth(paneState.innerWidth - 2);
	    });
	}*/
};


/**
 * Programmatically "reverts" the edit of a given triple.
 * @param subjectURI
 * @param predicateURI
 * @param objectNode
 * @param deleted
 */
swa.revert = function(subjectURI, predicateURI, objectNode, deleted) {
	var params = {
			'_base' : swa.queryGraphURI,
			'resource-1' : '<' + subjectURI + '>',
			'path-1' : '<' + predicateURI + '>'
	};
	if(deleted) {
		params['new-1'] = objectNode;
	}
	else {
		params['old-1'] = objectNode;
	}
	swa.submitEdits(params);
};


/**
 * Programmatically selects a given resource on a form.
 * Assumes that the given predicate is represented by a swa:URIResourceEditor.
 * May work incorrectly otherwise.
 * @param formId  the form id
 * @param predicateURI  the predicate to look for on the form
 * @param resourceURI  the URI of the resource
 * @param resourceLabel  the label of the resource
 */
swa.selectResourceOnForm = function(formId, predicateURI, resourceURI, resourceLabel) {
	$('#' + formId).find('[value="<' + predicateURI + '>"]').each(function() {
		var id = $(this).attr('name').substring(5);
		$('#new-' + id + '-field').val(resourceLabel);
		$('#new-' + id).val('<' + resourceURI + '>');
	});
};


/**
 * Selects a given node in a given tree.
 * Will expand if necessary, using a server-side shortest path algorithm.
 * @param treeId  the id of the tree
 * @param nodeURI  the URI of the resource to select
 * @param queryGraphURI  the result of calling ui:currentQueryGraph() or null
 */
swa.selectTreeNode = function(treeId, nodeURI, queryGraphURI) {
	
	// Do nothing for blank nodes
	if(nodeURI.indexOf("@") == 0) {
		return;
	}
	
	// Do nothing if already selected
	var oldTreeNode = swa.getSelectedTreeResource(treeId);
	if(oldTreeNode == nodeURI) {
		return;
	}
	
	if(queryGraphURI == null) {
		queryGraphURI = swa.queryGraphURI;
	}
	
	// TODO: Currently this may only work on the Tree that was created last
	//       but not if multiple trees are on a page
	
	var tree = $('#' + treeId);
	var dataProviderURI = tree.attr('treedataprovider');
	if(!dataProviderURI) {
		alert('Error: Element with id ' + treeId + ' does not have treedataprovider attribute');
		return;
	}
	
	var rootURI = tree.attr('treeroot');
	
	// Do nothing if it's already selected
	var sel = tree.jstree('get_selected');
	if(sel) {
		var selURI = sel.attr('resource');
		if(selURI == nodeURI) {
			return;
		}
	}
	
	if(queryGraphURI == null) {
		alert('Error: queryGraphURI is null - cannot select tree node ' + nodeURI + ' at tree with id ' + treeId);
		return;
	}

	// Load path to root from the server and then call helper function
	var data = {
			_base: queryGraphURI,
			_viewClass: 'swa:TreeShortestPathCallback',
			dataProvider: '<' + dataProviderURI + '>',
			node: '<' + nodeURI + '>'
	};
	if (swa.server != '') {
		data._server = escape(swa.server);
	}
	if(rootURI) {
		data.root = '<' + rootURI + '>';
	}
	$.get(swa.server + swa.servlet, data, function(path) {
		if(path) {
			swa.selectTreeNodeHelper(tree, tree, path, 0);
		}
	});
};


// Private helper function - walks an array, expanding nodes along the way
swa.selectTreeNodeHelper = function(tree, node, path, index) {

	var next = path[index];
	
	node.children("ul").children("li").each(function(i, o) {
		var child = $(o);
		if(child.attr('resource') == next) {
			if(index == path.length - 1) {
				// End reached: select this node
				tree.jstree('select_node', child, true);
				child[0].scrollIntoView();
			}
			else {
				tree.jstree('open_node', child, function() {
					swa.selectTreeNodeHelper(tree, child, path, index + 1);
				});
			}
		}
	});
};


/**
 * Helper method used to add the key properties from the check boxes on the search
 * form to a URL.
 * @param form  the form
 * @returns the key properties string, starting with &
 */
swa.serializeKeyProperties = function(form) {
	var result = "";
	$.each(form.find('.swa-key-property-input:checked'), function(index, value) {
		var value = $(value).attr('value');
		result += '&keyProperty' + index + '=' + escape(value);
	});
	return result;
};


swa.servletURL = function(servletName) {
	if(swa.servlet != 'swp' && swa.endsWith(swa.servlet, '/swp')) {
		return swa.servlet.substring(0, swa.servlet.length - 3) + servletName;
	}
	else {
		return servletName;
	}
};


/**
 * Programmatically selects a given resource in a given auto-complete.
 * The label of the resource is loaded from the server based on its URI.
 * @param id  the id used by the auto-complete
 * @param resourceURI  the URI of the resource
 */
swa.setAutoCompleteResource = function(id, resourceURI) {
	
	var params = {
		_base : swa.queryGraphURI,
		_viewClass : 'swa:GetResourceLabel',
		resource : '<' + resourceURI + '>'
	};

	$.getJSON(swa.servlet, params, function(result) {

		var field = $('#' + id + '-field');
		field.val(result.label);
		field.removeClass('swa-auto-complete-dirty');
		
		var hiddenField = $('#' + id);
		hiddenField.val('<' + resourceURI + '>');

	});
};


/**
 * Programmatically selects a given class in the type selection above a given
 * search form.  Note that this function does not actually reload the search form.
 * @param formId  the form id used when the SearchForm was created
 * @param typeURI  the URI of the type to select
 */
swa.setSearchFormType = function(formId, typeURI) {
	$('#' + formId + 'LID-typeSelect').val(typeURI);
};


/**
 * Changes the title of an swa:Window.
 * @param windowId  the id of the window
 * @param title  the new title
 */
swa.setWindowTitle = function(windowId, title) {
	$('#' + windowId + '-window-title').html(title);
};


/**
 * Changes the title of an swa:Window surrounding a given DOM element.
 * Does nothing if the parent does not exist.
 * @param childId  the id of the child
 * @param title  the new title
 */
swa.setWindowTitleIfExists = function(childId, title) {
	var window = $("#" + childId).closest(".swa-window");
	if(window) {
		var windowId = window.attr("id");
		if(windowId) {
			swa.setWindowTitle(windowId, title);
		}
	}
};


/**
 * Can be called after edits were handled to display the number of changed triples.
 * @param data  the JSON response with "added" and "deleted" attributes.
 */
swa.showEditSuccess = function(data) {
	alert("Added " + (data.added ? data.added : 0) + 
			" and deleted " + (data.deleted ? data.deleted : 0) + " statements.");
};


/**
 * Displays the SPARQL query behind a Search form in a dialog.
 * @param formId  the id of the search form
 */
swa.showSearchQuery = function(formId) {
	var params = swa.getSearchParamsFromForm(formId);
	$.get('getSearchQuery?' + params, function(data) {
		var win = $('<div><pre id="queryDiv"></pre></div>');
		$(win.children()[0]).text(data.query); 
		$(win).dialog({
	        'modal' : true,
	        'title' : 'SPARQL Query generated by Search Form',
	        'width' : '800px',
	        'buttons': {
	            'OK': function() {
	                $(this).dialog('close');
	            }
	        }
	    });
	});
};


/**
 * Used by submitForm, but can also be used to simulate form-like edits.
 * @param params  the params, like in the edit form
 * @param onSuccess  an optional call-back for after success
 * @param servlet  the servlet
 * @param formId  used only to refresh the form at the end
 * @param warningsAccepted  true if this has been called after warnings have been Ok'ed by the user
 */
swa.submitEdits = function(params, onSuccess, servlet, formId, warningsAccepted) {
	if(!servlet) {
		servlet = swa.servletURL('swpEdit');
	}
	if(warningsAccepted) {
		params += '&warningsAccepted=true';
	}
	
	$.post(swa.server + servlet, params, function(data) {
		if(data && data.errors) {
			swa.updateFormErrors($('#' + formId), data.errors);
			var msg = data.errors.length + ' Constraint violations:';
			$.each(data.errors, function(index, item) {
				msg += '\n - ' + item.message;
			});
			alert(msg);
		}
		else {
			
			if(data.warnings && warningsAccepted != true) {
				swa.updateFormErrors($('#' + formId), data.warnings);
				var msg = data.warnings.length + ' Constraint violations:';
				$.each(data.warnings, function(index, item) {
					msg += '\n - ' + item.message;
				});
				msg += '\nAre you sure you want to make these edits?';
				if(confirm(msg)) {
					swa.submitEdits(params, onSuccess, servlet, formId, true);
				}
				return;
			}
			
			if(onSuccess) {
				eval(onSuccess);
			}
			else if(formId) {
				if(data.labelChanges && data.rootResource && data.labelChanges[data.rootResource]) {
					swa.switchToViewFormWithLabelChange(formId);
				}
				else {
					swa.switchToViewForm(formId);
				}
				
				// Tell SwitchableFormGadget that it doesn't need to reload again on this event
				data['formAlreadyReloaded-' + formId] = true;
			}
			swa.processEdits(data, true);
		}
	});
};


/**
 * Submits a form and (by default) switches it to viewing mode when done.
 * @param formId  the id of the form
 * @param servlet  the optional name of the servlet
 * @param suppressSwitch  a JS snippet that is called on success, if unset will switch form only
 */
swa.submitForm = function(formId, servlet, onSuccess) {
	var params = $('#' + formId).serialize();
	if(swa.logMessageBoxStatus) {
		swa.promptLogMessage(params, onSuccess, servlet, formId);
	}
	else {
		swa.submitEdits(params, onSuccess, servlet, formId);
	}
};


/**
 * Called by the swa:ParamsDialog when the user hits OK.
 * Submits the form to the server which either returns a JSON object with
 * name-value-pairs or a JSON with constraint violations.
 * Closes the dialog and calls a given function on success.
 * @param loadId  the dialog id
 * @param callback  a JavaScript expression that shall be called on success
 *                  (the variable data is bound to the result from the server)
 */
swa.submitParamsDialog = function(loadId, callback) {
	var formId = loadId + '-form';
	var params = {};
	$.each($('#' + formId).serializeArray(), function(_, kv) {
	    params[kv.name] = kv.value;
	});
	//params['_base'] = ''; // 'http://uispin.org/ui#graph';
	$.post(swa.server + swa.servletURL('swpCreateParams'), params, function(data) {
		if(data && data.errors) {
			var msg = data.errors.length + ' Constraint violations:';
			$.each(data.errors, function(index, item) {
				msg += '\n - ' + item.message;
			});
			swa.updateFormErrors($('#' + formId), data.errors);
			alert(msg);
		}
		else {
			swa.closeDialog(loadId);
			eval(callback);
		}
	});
};


// Private: called by the ViewForm when the user presses Edit 
swa.switchToEditForm = function(formId) {
	$('#' + formId + '-actionsButton').css('visibility', 'hidden');
	$('#' + formId + '-editButton').css('visibility', 'hidden');
	$('#' + formId + '-historyModeBoxDiv').css('visibility', 'hidden');
	swa.load(formId + '-loadable', { editing : true }, function() {
		$('#' + formId + '-editModeButtonBar').css('display', '');
	});
};


// Private: called by the ViewForm when the user presses Cancel or after submitting 
swa.switchToViewForm = function(formId) {
	$('#' + formId + '-editModeButtonBar').css('display', 'none');
	var params = { editing : false };
	$('#' + formId + '-historyModeBox').each(function() {
		if($(this).is(':checked')) {
			params['viewModeName'] = '\"history\"';
		}
	});
	swa.load(formId + '-loadable', params, function() {
		$('#' + formId + '-actionsButton').css('visibility', '');
		$('#' + formId + '-editButton').css('visibility', '');
		$('#' + formId + '-historyModeBoxDiv').css('visibility', '');
	});
};


// Can be overloaded to reload the area surrounding the form
swa.switchToViewFormWithLabelChange = function(formId) {
	swa.switchToViewForm(formId);
};


/**
 * Called when the user clicks on the toggle button in an openable swa:ObjectsEnum.
 * @param bodyId  the id of the body to hide/show
 * @param buttonId  the id of the div with the button
 */
swa.toggleObjectsEnum = function(bodyId, buttonId) {
	var button = $('#' + buttonId);
	var body = $('#' + bodyId);
	if(button.hasClass('ui-icon-triangle-1-s')) { // It's open
		button.removeClass('ui-icon-triangle-1-s');
		button.addClass('ui-icon-triangle-1-e');
		body.css('display', 'none');
	}
	else {
		button.removeClass('ui-icon-triangle-1-e');
		button.addClass('ui-icon-triangle-1-s');
		body.css('display', '');
	}
};


/**
 * Checks if a given resource URI in a tree is a class.
 * This check is using the tree icon and therefore assumes that the
 * corresponding tree has been loaded already.
 * @param uri  the resource URI to check
 * @param treeId  the id of the tree to walk through
 * @returns true  if uri is a class, false if not a class or unknown
 */
swa.treeResourceIsClass = function(uri, treeId) {
	if(uri) {
		var found = $('#' + treeId).find('li[resource="' + uri + '"]');
		if(found && found.size() > 0) {
			var child = found.find('.swa-icon-class');
			return child && child.size() > 0;
		}
	}
	return false;
};


/**
 * Called to write a virtual node into a hidden text field, based on input string and selected language
 * @param uid  the uid of the swa:ExactMatchStringFacet
 */
swa.updateExactMatchStringFacet = function(uid) {
	var str = $('#' + uid + '-text').val();
	if(str && str != '') {			
		var lang = $('#' + uid + '-lang').val();
		var val = '"' + str + '"';
		if(lang && lang != '') {
			val += '@' + lang;
		}
		else {
			// Work-around to TDB bug (TDB does not handle untyped as typed literals).
			// Can be deleted in future versions, once TDB has been fixed/replaced.
			val += '^^<http://www.w3.org/2001/XMLSchema#string>';
		}
		$('#' + uid + '-hidden').val(val);
	}
	else {
		$('#' + uid + '-hidden').val('');
	}
};


/**
 * Displays or clears the error indicators on a given form, based
 * on an array of errors (as produced by the SPIN constraint validation)
 * @param form  the id of the form containing the indicators 
 * @param errors  the errors to display
 */
swa.updateFormErrors = function(form, errors) {
	$(form).find('.swa-property-label').each(function(index, itemElement) {
		var item = $(itemElement);
		var e = false;
		$.each(errors, function(i, error) {
			if(item.attr('id') == 'property-label-' + error.path) {
				e = true;
				item.addClass('swa-error');
				item.attr('title', error.message);
			}
		});
		if(!e) {
			item.removeClass('swa-error');
			item.removeAttr('title');
		}
	});
};


/**
 * Called by a timer to fetch a progress update from the server, and then recursively
 * starts a new timer.
 */
swa.updateProgressMonitorDialog = function(progressId) {
	var params = {
    		_viewClass : 'swa:ProgressJSONCallback',
    		id : progressId
    	};
	$.get(swa.server + swa.servlet, params, function(data) {
		if(data) {
			$('#swaProgressTask').html(data.task ? data.task : "");
			$('#swaProgressSubTask').html(data.subTask ? data.subTask : "");
		    setTimeout("swa.updateProgressMonitorDialog('" + progressId + "')", 250);
		}
		else if(swa.progressMonitorDialogId == progressId) {
			swa.closeProgressMonitorDialog();
		}
	});
};


//private
swa.updateSelectedTemplate = function(templateURI, selectId) {
	var option = $('[id="option-' + templateURI + '"]');
	option.attr('selected', 'selected');
	$('#' + selectId).change();
};


/**
 * Renames all nodes of a given Tree in response to an incoming change. 
 * @param treeId  the id of the tree to update
 * @param change  the change (delivered by the server)
 */
swa.updateTreeLabels = function(treeId, change) {
	if(change.labelChanges) {
		var tree = $('#' + treeId);
		for(var key in change.labelChanges) {
			var newLabel = change.labelChanges[key];
			tree.find('li[resource="' + key + '"]').each(function(index, node) {
				var c = $(node).children("a").contents();
				c[c.length - 1].nodeValue = newLabel;
			});
		}
	}
};


/**
 * Validates a form and updates the errors.
 * @param form  the id of the form
 * @returns false to stop further processing
 */
swa.validateForm = function(form) {
	var params = $(form).serialize();
	$.getJSON(swa.server + swa.servletURL('swpEdit') + '?validateOnly=true&' + params, function(data) {
		if(data.errors) {
			swa.updateFormErrors(form, data.errors);
		}
		else {
			swa.updateFormErrors(form, []);
		}
	});
	return false;
};


// Deep linking 
// See http://stackoverflow.com/questions/1844491/intercepting-call-to-the-back-button-in-my-ajax-application-i-dont-want-it-to

swa.hash = null;

swa.checkHash = function() {
	if (window.location.hash != swa.hash) {
		swa.hash = window.location.hash;
		if(swa.hash.length > 1) {
			// Work around Firefox bug: http://stackoverflow.com/questions/1703552/encoding-of-window-location-hash
			var href = window.location.href;
			var hashIndex = href.indexOf('#');
			var rawHash = hashIndex > 0 ? href.substring(hashIndex + 1) : href;
			var resourceURI;
			if(rawHash.indexOf(':') > 0) {
		 		resourceURI = rawHash; // Already decoded (Firefox page reload)
		 	}
		 	else {
		 		resourceURI = decodeURIComponent(rawHash);
		 	}
			gadgets.Hub.publish(swa.deepLinkingEvent, resourceURI);
		}
	}
};


/**
 * Sets up deep linking to synchronize the data payload of a given event with the hash part
 * of the window (browser bar) location.  This function should be called at most once.
 * @param event  the name of the event to publish and subscribe to
 */
swa.initDeepLinking = function(event) {
	
	swa.deepLinkingEvent = event;
	
	// Wait until any outstanding tree initialization callbacks have finished, then start updating
	$(document).one("ajaxStop", function() {
		setInterval(swa.checkHash, 100);
	});
	
	// Always remember resource from event in hash
	gadgets.Hub.subscribe(event, function(event, data) {
		window.location.hash = '#' + encodeURIComponent(data);
		swa.hash = window.location.hash;
	});
};


// Facets support -------------------------------------------------------------


swa.getSummarySearchPageSize = function(id) {
	return parseInt($("#" + id + "-pageSize").val());
};


swa.openAutoCompleteFacetedSearchDialog = function(elementId, typeURI) {
	var loadId = 'myFacetedSearchDialog' + swa.getRunningIndex();
	var params = {
		callback: "swa.setAutoCompleteResource('" + elementId + "', resource)",
		loadId: '"' + loadId + '"', 
		type: '<' + typeURI + '>',
		_base: '<' + swa.queryGraphURI + '>'
	};
	swa.loadModalDialog('swa:SelectionFacetedSearchDialog', loadId, params, 1000, 600);
};


/**
 * Displays a faceted search dialog based on a given Search form.
 * @param formId  the id of the search form
 */
swa.openDerivedFacetedSearchDialog = function(formId, resourceSelectedEvent) {
	var searchGraphURI = $('#' + formId).attr('searchGraph');
	var params = swa.getSearchParamsFromForm(formId);
	params += "&searchGraph=" + searchGraphURI;
	$.post(swa.servletURL('createSearchRDF'), params, function() {
		var loadId = 'myFacetedSearchDialog';
		var params = {
			baseSearchGraph: '<' + searchGraphURI + '>',
			loadId: '"' + loadId + '"', 
			resourceSelectedEvent: resourceSelectedEvent,
			_base: '<' + swa.queryGraphURI + '>'
		};
		swa.loadModalDialog('swa:DerivedFacetedSearchDialog', loadId, params, 1000, 600);
	});
};


swa.reloadSummarySearchResults = function(id, startIndex, searchGraph) {
	var params = {
		pageSize : swa.getSummarySearchPageSize(id),
		searchGraph : "<" + searchGraph + ">",
		startIndex : startIndex
	};
	var sortField = $("#" + id + "-sortField").val();
	if(sortField && sortField != "") {
		params.sortProperty = "<" + sortField + ">";
	}
	swa.load(id, params);
};


swa.toggleTwiddle = function(twiddleId) {
	var body = $('#' + twiddleId + '-body');
	var icon = $('#' + twiddleId + '-twiddle-icon');
	if(body.css('display') == 'none') {
		body.css('display', '');
		icon.removeClass('swa-facets-icon-chevron-up');
		icon.addClass('swa-facets-icon-chevron-down');
	}
	else {
		body.css('display', 'none');
		icon.addClass('swa-facets-icon-chevron-up');
		icon.removeClass('swa-facets-icon-chevron-down');
	}
};




// Maps support ---------------------------------------------------------------


// Keys are the ?ids, values are the Map objects
swa.googleMaps = {};

// Keys are the ?ids, values are arrays of Marker objects
swa.googleMapMarkers = {};

// Keys are the ?ids, values the ?searchGraph URIs
swa.googleMapSearchGraphs = {};

// Timer jobs
swa.googleMapUpdating = {};


swa.initGoogleMap = function(id, searchGraph) {
	if(false && navigator.geolocation) { // Disabled because it does not work consistently on FF
		navigator.geolocation.getCurrentPosition(function(position) {
			var lat = position.coords.latitude;
		    var long = position.coords.longitude;
		    swa.initGoogleMapWithPosition(id, searchGraph, lat, long);
		}, function(error) {
			swa.initGoogleMapWithPosition(id, searchGraph, -34.397, 150.644);
		});
	}
	else {
		swa.initGoogleMapWithPosition(id, searchGraph, -34.397, 150.644);
	}
};


swa.initGoogleMapWithPosition = function(id, searchGraph, lat, long) {
	var mapOptions = {
		center: new google.maps.LatLng(lat, long),
		zoom: 8,
		mapTypeId: google.maps.MapTypeId.ROADMAP
	};
	swa.googleMaps[id] = new google.maps.Map(document.getElementById(id), mapOptions);
	swa.googleMapMarkers[id] = {};
	google.maps.event.addListener(swa.googleMaps[id], 'bounds_changed', function() {
		if(!swa.googleMapUpdating[id]) {
			swa.googleMapUpdating[id] = true;
			setTimeout(function() {
				swa.googleMapUpdating[id] = false;
				swa.updateMapMarkers(id);
			}, 1000);
		}
	});
};


swa.removeGoogleMapMarkers = function(id) {
	var markers = swa.googleMapMarkers[id];
	if(markers) {
		for (var resource in markers) {
			markers[resource].setMap(null);
		}
	}
};


swa.updateMapMarkers = function(id) {
	var searchGraph = swa.googleMapSearchGraphs[id];
	if(searchGraph) {
		var map = swa.googleMaps[id];
		var bounds = map.getBounds();
		var params = {
			maxLat : bounds.getNorthEast().lat(),
			minLat : bounds.getSouthWest().lat(),
			maxLong : bounds.getNorthEast().lng(),
			minLong : bounds.getSouthWest().lng(),
			searchGraph : "<" + searchGraph  + ">"
		};
		swa.load(id + '-loadable', params);
	}
};



// Some global initialization code for jQuery ---------------------------------
$().ready(function(){

	// Force charset=UTF-8 to be used - otherwise non-unicode characters will fail
	// on Chrome and tomcat on Windows (JIRA EVN-160)
	$.ajaxSettings.contentType = "application/x-www-form-urlencoded; charset=UTF-8";
	
	// Global error handling
	$(document).ajaxError(function(event, request, settings, error) {
		if('abort' != error) {
			if (error != undefined) {
				var start = error.indexOf('Summary: [');
				if(start > 0) {
					var end = error.indexOf(']', start);
					error = error.substring(start + 10, end);
				}
			}
			alert('Server Interaction Error: ' + error + '\n\nIf you believe this is an unexpected error, you may want to contact the system administrator and/or refresh your browser before continuing.');
		}
	});
});

//TODO: Unclear whether the following should be in swa.js in case it's also used in OpenSocial mode.

/**
* An associative array where the values are the ids of swa:Windows and the keys
* are subscriptions, as returned by the subscribe call.
* 
*/
swa.eventsRegistry = {};


/**
* Registers a subscription so that it can be unsubscribed later.
* @param sub  the subscription id (results of subscribe call)
* @param windowId  the id of the window (or null)
* @param ownerId  the id of an owner DOM element (or null)
*/
swa.registerSubscription = function(sub, windowId, ownerId) {
	if(windowId && windowId != '') {
		swa.eventsRegistry[sub] = windowId;
	}
	if(ownerId && ownerId != '') {
		$("#" + ownerId).on("remove", function () {
			gadgets.Hub.unsubscribe(sub);
		});
	}
};


/**
* Unsubscribes all subscriptions associated with a given swa:Window.
* @param windowId  the id of the window to unsubscribe
*/
swa.unsubscribeWindow = function(windowId) {
	$.each(swa.eventsRegistry, function(index, value) {
		if(value == windowId) {
			gadgets.Hub.unsubscribe(index);
			delete swa.eventsRegistry[index];
		}
	});
};
