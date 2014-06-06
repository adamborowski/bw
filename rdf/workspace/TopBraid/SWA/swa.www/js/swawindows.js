/**
 * A small subset of the OpenSocial gadgets implementation so that swa:Gadgets
 * can run stand-alone, without requiring a full OpenSocial container.
 * 
 * This file is included by default if swa:Application is used (subclassed).
 */

var gadgets = {
		
	// gadgets.Hub can be used for inter-gadget eventing, see
	// http://opensocial-resources.googlecode.com/svn/spec/2.5/Core-Gadget.xml#interGadgetEventing
	Hub : OpenAjax.hub
};

