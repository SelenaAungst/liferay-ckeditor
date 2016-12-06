/**
 * @license Copyright (c) 2003-2016, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or http://ckeditor.com/license
 */

/**
 * @fileOverview Plugin created to handle #11064. While the issue is caused by native Webkit/Blink behaviour
 * this plugin can be easily detached/modified when issue is fixed without changing the core.
 * When Ctrl/Cmd + A is pressed to select all content it does not work due to bug in
 * Webkit/Blink if non-editable element is on the beginning/end of the content.
 */

( function() {
	'use strict';

	CKEDITOR.plugins.add( 'widgetselection', {

		init: function( editor ) {
			if ( CKEDITOR.env.webkit ) {
				var widgetselection = CKEDITOR.plugins.widgetselection;

				editor.on( 'contentDom', function( evt ) {

					var editor = evt.editor,
						doc = editor.document,
						editable = editor.editable();

					editable.attachListener( doc, 'keydown', function( evt ) {
						var data = evt.data.$;

						// Ctrl/Cmd + A
						if ( evt.data.getKey() == 65 && ( CKEDITOR.env.mac && data.metaKey || !CKEDITOR.env.mac && data.ctrlKey ) ) {

							// Defer the call so the selection is already changed by the pressed keys.
							CKEDITOR.tools.setTimeout( function() {

								// Manage filler elements on keydown. If there is no need
								// to add fillers, we need to check and clean previously used once.
								if ( !widgetselection.addFillers( editable ) ) {
									widgetselection.removeFillers( editable );
								}
							}, 0 );
						}
					}, null, null, -1 );

					// Check and clean previously used fillers.
					editor.on( 'selectionCheck', function( evt ) {
						widgetselection.removeFillers( evt.editor.editable() );
					} );

					// Remove fillers on paste before data gets inserted into editor.
					editor.on( 'paste', function( evt ) {
						evt.data.dataValue = widgetselection.cleanPasteData( evt.data.dataValue );
					} );

					if ( 'selectall' in editor.plugins ) {
						widgetselection.addSelectAllIntegration( editor );
					}
				} );
			}
		}
	} );

	/**
	 * Set of helper methods for the Widget Selection plugin.
	 *
	 * @property widgetselection
	 * @member CKEDITOR.plugins
	 * @since 4.6.1
	 */
	CKEDITOR.plugins.widgetselection = {

		/**
		 * Start filler element reference.
		 *
		 * @property {CKEDITOR.dom.element}
		 * @member CKEDITOR.plugins.widgetselection
		 * @private
		 */
		startFiller: null,

		/**
		 * End filler element reference.
		 *
		 * @property {CKEDITOR.dom.element}
		 * @member CKEDITOR.plugins.widgetselection
		 * @private
		 */
		endFiller: null,

		/**
		 * Attribute which identifies filler element.
		 *
		 * @property {String}
		 * @private
		 */
		fillerAttribute: 'data-cke-filler-webkit',

		/**
		 * Filler element default content. Note: filler needs to have `visible` content.
		 * Unprintable elements or empty content does not help as a workaround.
		 *
		 * @property {String}
		 * @private
		 */
		fillerContent: '&nbsp;',

		/**
		 * Tag name which is used to create fillers.
		 *
		 * @property {String}
		 * @private
		 */
		fillerTagName: 'div',

		/**
		 * Adds filler before/after non-editable element on the beginning/end of the `editable`.
		 *
		 * @param {CKEDITOR.editable} editable
		 * @returns {Boolean}
		 * @member CKEDITOR.plugins.widgetselection
		 */
		addFillers: function( editable ) {
			var editor = editable.editor;

			// Whole content should be selected, if not fix the selection manually.
			if ( !this.isWholeContentSelected( editable ) && editable.getChildCount() > 0 ) {

				var firstChild = editable.getFirst( filterTempElements ),
					lastChild = editable.getLast( filterTempElements );

				// Check if first element is editable. If not prepend with filler.
				if ( firstChild && firstChild.type == CKEDITOR.NODE_ELEMENT && !firstChild.isEditable() ) {
					this.startFiller = this.createFiller();
					editable.append( this.startFiller, 1 );
				}

				// Check if last element is editable. If not append filler.
				if ( lastChild && lastChild.type == CKEDITOR.NODE_ELEMENT && !lastChild.isEditable() ) {
					this.endFiller = this.createFiller( true );
					editable.append( this.endFiller, 0 );
				}

				// Reselect whole content after any filler was added.
				if ( this.hasFiller( editable ) ) {
					var rangeAll = editor.createRange();
					rangeAll.selectNodeContents( editable );
					rangeAll.select();
					return true;
				}
			}
			return false;
		},

		/**
		 * Removes filler elements or updates its references.
		 *
		 * It will **not remove** filler elements if the whole content is selected, as it would break the
		 * selection.
		 *
		 * @param {CKEDITOR.editable} editable
		 */
		removeFillers: function( editable ) {
			// If startFiller or endFiller exists and not entire content is selected it means the selection
			// just changed from selected all. We need to remove fillers and set proper selection/content.
			if ( this.hasFiller( editable ) && !this.isWholeContentSelected( editable ) ) {

				var startFillerContent = editable.findOne( this.fillerTagName + '[' + this.fillerAttribute + '=start]' ),
					endFillerContent = editable.findOne( this.fillerTagName + '[' + this.fillerAttribute + '=end]' );

				if ( this.startFiller && startFillerContent && this.startFiller.equals( startFillerContent ) ) {
					this.removeFiller( this.startFiller, editable );
				} else {
					// The start filler is still present but it is a different element than previous one. It means the
					// undo recreating entirely selected content was performed. We need to update filler reference.
					this.startFiller = startFillerContent;
				}

				if ( this.endFiller && endFillerContent && this.endFiller.equals( endFillerContent ) ) {
					this.removeFiller( this.endFiller, editable );
				} else {
					// Same as with start filler.
					this.endFiller = endFillerContent;
				}
			}
		},

		/**
		 * Removes fillers from the paste data.
		 *
		 * @param {String} data
		 * @returns {String}
		 * @private
		 */
		cleanPasteData: function( data ) {
			if ( data && data.length ) {
				data = data
					.replace( this.createFillerRegex(), '' )
					.replace( this.createFillerRegex( true ), '' );
			}
			return data;
		},

		/**
		 * Checks if the whole content of the given editable is selected.
		 *
		 * @param {CKEDITOR.editable} editable
		 * @returns {Boolean}
		 * @private
		 */
		isWholeContentSelected: function( editable ) {

			var range = editable.editor.getSelection().getRanges()[ 0 ];
			if ( range ) {

				if ( range && range.collapsed ) {
					return false;

				} else {
					var rangeClone = range.clone();
					rangeClone.enlarge( CKEDITOR.ENLARGE_ELEMENT );

					return !!( rangeClone && editable && rangeClone.startContainer && rangeClone.endContainer &&
						rangeClone.startOffset === 0 && rangeClone.endOffset === editable.getChildCount() &&
						rangeClone.startContainer.equals( editable ) && rangeClone.endContainer.equals( editable ) );
				}
			}
			return false;
		},

		/**
		 *	Checks if there is any filler element in the given editable.
		 *
		 * @param {CKEDITOR.editable} editable
		 * @returns {Boolean}
		 * @private
		 */
		hasFiller: function( editable ) {
			return editable.find( this.fillerTagName + '[' + this.fillerAttribute + ']' ).count() > 0;
		},

		/**
		 * Creates filler element.
		 *
		 * @param {Boolean} [onEnd] If filler will be placed on end or beginning of the content.
		 * @returns {CKEDITOR.dom.element}
		 * @private
		 */
		createFiller: function( onEnd ) {
			var filler = new CKEDITOR.dom.element( this.fillerTagName );
			filler.setHtml( this.fillerContent );
			filler.setAttribute( this.fillerAttribute, onEnd ? 'end' : 'start' );
			filler.setAttribute( 'data-cke-temp', 1 );
			filler.setStyles( {
				display: 'block',
				width: 0,
				height: 0,
				padding: 0,
				border: 0,
				margin: 0,
				position: 'absolute',
				top: 0,
				left: '-9999px',
				opacity: 0,
				overflow: 'hidden'
			} );

			return filler;
		},

		/**
		 * Removes specific filler element from the given editable. If filler contains any content (typed or pasted),
		 * it replaces the current editable content. If not, the caret is placed before first or after last editable
		 * element (depends if filler was on the beginning/end).
		 *
		 * @param {CKEDITOR.dom.element} filler
		 * @param {CKEDITOR.editable} editable
		 * @private
		 */
		removeFiller: function( filler, editable ) {
			if ( filler ) {
				var editor = editable.editor,
					currentRange = editable.editor.getSelection().getRanges()[ 0 ],
					currentPath = currentRange.startPath(),
					range = editor.createRange(),
					insertedHtml,
					fillerOnStart,
					manuallyHandleCaret;

				if ( currentPath.contains( filler ) ) {
					insertedHtml = filler.getHtml();
					manuallyHandleCaret = true;
				}

				fillerOnStart = filler.getAttribute( this.fillerAttribute ) == 'start';
				filler.remove();
				filler = null;

				if ( insertedHtml && insertedHtml.length > 0 && insertedHtml != this.fillerContent ) {
					editable.insertHtmlIntoRange( insertedHtml, editor.getSelection().getRanges()[ 0 ] );
					range.setStartAt( editable.getChild( editable.getChildCount() - 1 ), CKEDITOR.POSITION_BEFORE_END );
					editor.getSelection().selectRanges( [ range ] );

				} else if ( manuallyHandleCaret ) {
					if ( fillerOnStart ) {
						range.setStartAt( editable.getFirst().getNext(), CKEDITOR.POSITION_AFTER_START );
					} else {
						range.setEndAt( editable.getLast().getPrevious(), CKEDITOR.POSITION_BEFORE_END );
					}
					editable.editor.getSelection().selectRanges( [ range ] );
				}
			}
		},

		/**
		 * Creates regular expression which will match the filler html in the text.
		 *
		 * @param {Boolean} [onEnd] If regexp should be created for filler on the beginning or end of the content.
		 * @returns {RegExp}
		 * @private
		 */
		createFillerRegex: function( onEnd ) {
			var matcher = this.createFiller( onEnd ).getOuterHtml()
				.replace( /style="[^"]*"/gi, 'style="[^"]*"' )
				.replace( />[^<]*</gi, '>[^<]*<' );

			return new RegExp( ( !onEnd ? '^' : '' ) + matcher + ( onEnd ? '$' : '' ) );
		},

		/**
		 * Adds an integration for [Select All](http://ckeditor.com/addon/selectall) plugin to the given `editor`.
		 *
		 * @private
		 * @param {CKEDITOR.editor} editor
		 */
		addSelectAllIntegration: function( editor ) {
			var widgetselection = this;

			editor.editable().attachListener( editor, 'beforeCommandExec', function( evt ) {
				var editable = editor.editable();

				if ( evt.data.name == 'selectAll' && editable ) {
					widgetselection.addFillers( editable );
				}
			}, null, null, 9999 );
		}
	};


	function filterTempElements( el ) {
		return el.getName && !el.hasAttribute( 'data-cke-temp' );
	}

} )();