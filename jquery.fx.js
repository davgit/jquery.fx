/**
 * jQuery.fx get the best animations from your browser
 * @author : Nicolas Riciotti aka Twode
 * @fileoverview : this plugin offers an enhanced version of jquery animate using :
 * csstransitions, csstransform( translate/translate3d ), requestAnimationFrame
 * when none of those properties are available, it will use a custom fx manager based on a setTimeout.
 * for any animations on any elements, only one setTimeout will be used.
 * The last element to be animated will stop the setTimeout on it's animation end or stop.
 * This Plugin add new behaviours to the jquery stop method without overriding it.
 * 
 * for enhanced easing :
 * load jquery easing (http://gsgd.co.uk/sandbox/jquery/easing/)
 * and jquery.csseasing.js available in this package.
 * Bounce and Elastic are not available for css easing, 'ease(In|Out)Back' are used as a fallback.
 * 
 * sample usage : 
 * 
 *  $( element ).fx({ 
 *                    top: '+=50px',
 *                    left: '20%',
 *                    opacity: 0.2
 *                  },
 *                  { 
 *                    duration: 2000,
 *                    usetransition: false,
 *                    usetranslate: true,
 *                    useraf: true
 *                  },
 *                  'easeInOutQuad',
 *                  function(){
 *                        alert( 'end of the fx animation ');
 *                  }
 *  );
 *
 *
 */


(function($) {
   
        
    $.fxConfig = {
		duration: 700,
   		step: function(){},
   		usetranslate: true,
   		usetranslate3d : true,
   		usetransition : true,
   		fps : $.fx.interval
    }
    	
    //ref to the original jQuery stop method
    var jStop = jQuery.fn.stop;
    
    /* overide default Jquery.easing for compatibility 
     * with jquery easing plugin by George McGinley Smith
     * (http://gsgd.co.uk/sandbox/jquery/easing/); */
    $.easing['jlinear'] = $.easing['linear'];
    $.easing['jswing'] = $.easing['swing'];
    $.extend( $.easing,{
    	linear: function (x, t, b, c, d){
    	   return t/d*c;
    	},
    	swing: function (x, t, b, c, d) {
    		return -c *(t/=d)*(t-2) + b;
    	}
    });
    
    /* default css transition easing */
    $.csseasing = $.extend( $.csseasing || {}, {
        linear : 'cubic-bezier(0.250, 0.250, 0.750, 0.750)',
        swing : 'cubic-bezier(0.550, 0.085, 0.680, 0.530)'
    });
    
    /* fixing ie<9 date.now support */
    Date.now = Date.now || function() { return +new Date; };
    
    

    /* -------------------------------------------------------------- */
    
    /* SUPPORT */
    
    window.support = (function(){
    
    	var cssPrefixes = ['', '-ms-', '-o-', '-webkit-', '-webkit-', '-moz-'],
            vendors =     ['', 'Ms'  , 'O'  , 'WebKit'  , 'Webkit'  , 'Moz'  ],
			div = document.createElement('div');
            
		function testProperty( prop ){
            return getPrefixed( prop ) == false ? false : true;
        };
        
		function getPrefixed ( prop, cssformat ) {
		   var formatForCss = cssformat || true,
		       propd;
		       
           if ( prop in div.style ) return true;  
           
           propd = prop.replace(/(^[a-z])/g, function(val) {  
              return val.toUpperCase();
           }).replace(/\-([a-z])/g, function(val,a) {  
              return a.toUpperCase();
           });  
			
		   l = vendors.length;
		   
	       while( l-- ){
	          if ( vendors[l] + propd in div.style  ){
	            return formatForCss ? cssPrefixes[l] + prop.toLowerCase() : vendors[l] + propd;
	          }else if( window[vendors[l].toLowerCase()+propd] != undefined ){
	            return vendors[l].toLowerCase() + propd;
	          }else if( typeof window[ vendors[l] + propd ] != 'undefined' ){
	            return vendors[l] + propd;
	          }
	       }
	       return false;
		};
			
        return {
        	cssprefix : testProperty('transform') ? getPrefixed('transform').replace('transform','') : '',
        	transition : testProperty('transition'),
        	transform : testProperty('transform'), 
        	translate3d : ( 'WebKitCSSMatrix' in window && 'm11' in new WebKitCSSMatrix() ) || testProperty( 'perspective' ),  
            getPrefixed : getPrefixed,
            test : testProperty
        }

    })();




    /* -------------------------------------------------------------- */
    
    /* REQUEST ANIMATION FRAME */
    
    (function initRequestAnimationFrame(){

        window.requestAnimationFrame = window[support.getPrefixed('RequestAnimationFrame')];
        window.cancelAnimationFrame = window[support.getPrefixed('CancelAnimationFrame')] || window[support.getPrefixed('CancelRequestAnimationFrame')];
    	if ( !window.requestAnimationFrame ){
	        window.requestAnimationFrame = function(callback, element) {
	            var currTime = new Date().getTime(),
	            	timeToCall = $.browser.msie ? $.fx.interval/*1000/60*/ : Math.max(0, 16 - (currTime - lastTime)),
	            	id = window.setTimeout(function(){
		            	callback(currTime + timeToCall);
		            }, timeToCall);
	            lastTime = currTime + timeToCall;
	            return id;
	        };
    	}
    	if ( !window.cancelAnimationFrame ){
    		window.cancelAnimationFrame = function ( id ) { clearTimeout( id ); };
    	}
    	
    	window.fxQueue = {};
		window.fxQueueLength = 0;
		window.numFx = 0;
        window.interval = $.fx.interval;
		window.startTime = 0;
		window.lastTime = 0;
		window.stopRAF = true;
    	
    	
    })();
    
    function startAnimationFrame(){
    	startTime = window.mozAnimationStartTime || Date.now();
    	stopRAF = false;
    	requestAnimationFrame( enterFrame );
    };
    
    function stopAnimationFrame(){
    	stopRAF = true;
    };
    
	function enterFrame( timestamp ){

        var drawStart = (timestamp || Date.now()),
        	diff = drawStart - startTime,
            f;
                
        if( diff < $.fx.interval ){
        	requestAnimationFrame( enterFrame );
        	return false;
        }
		for( f in fxQueue ){
			fxQueue[f].update( diff );
		}
        startTime = drawStart;
		if(!stopRAF)requestAnimationFrame( enterFrame );
	};


    /* --------------------------------------------------- */
    
    /* FX CLASS */ 

    function Fx( elem, options, prop ){
    
        var self = this,
            p,start,end,unit,parts;
        
		this.options = options;
		this.elem = elem;
		this.prop = prop;
		this.isTranslatable = this.isTranslatable() && support.transform && options.usetranslate;
		this.isTransition = support.transition && self.options.usetransition;
	
	};
	
	Fx.prototype = {

		getUnit: function ( val ){
		    var rfxnum = /^([+\-]=)?([\d+.\-e]+)([a-z%]*)$/i;
		    return rfxnum.exec( val );
		},
		
		convertPercentPx: function( val, method ){
			var parent = this.parent,
				parentDim = this.parentDim,
				convertcase = {
					'tpc' : val / parentDim * 100,
					'tpx' : val * parentDim / 100
				}
			return convertcase[ method ];
		},
		
	    cssMatrixToArray: function( matrix ) {

	    	var matrix,ml,i=0;
	    	matrix = matrix.substr(7, matrix.length - 8).split(', ');
	    	ml = matrix.length;
	    	for( ;i<ml;i++ ) matrix[i] = parseFloat(matrix[i]);
	        return matrix;
	    },

		getCurrentVal: function( p, method, parse ){
			
		   var self = this,
		       elem = this.elem,
		   	   prop = p || this.prop,
		   	   val, valParts, reg, cases, m,
			   method = method || 'def';
				
			   if( typeof parse === 'undefined' ) parse = true;
			   
			   cases = {
			   		gcs: function(){
			   			if( window.getComputedStyle ){
			   				return window.getComputedStyle( elem, null ).getPropertyValue( prop )
			   			} else if( elem.currentStyle ){
			   				return  elem.currentStyle[ prop ];
			   			}else{
			   				this.def();
			   			}
			   		},
			   		gas: function(){

			    	   //reg = new RegExp('\\-([a-zA-Z])*\\-transform\\s*:\\s*translate3?d?\\s*\\(([0-9.\-]*)px\\s*\\,\\s*([0-9.\-]*)px\\s*(\\,\\s*([0-9.\-])*p(x|t))?\\)','g');
			           reg = new RegExp('\\-([a-zA-Z])*\\-transform\\s*:\\s*translate3?d?\\s*\\(([0-9.\-]*)px\\s*\\,\\s*([0-9.\-]*)px\\s*(\\,\\s*([0-9.\-])*p(x|t))?\\s*\\)?','g');
			           $(elem).attr( 'style' ).replace(reg, function( match, prefx, x, y, z ){
			               m = 'matrix(1, 0, 0, 1, ' + x + ', ' + y + ')';
			           });
			           return m;
			   		},
			   		def: function(){
			   			return $(elem).css( prop );
			   		}
			   };

			   val = cases[ method ]();
				
				
			   if( typeof val === 'undefined' ){
					val = cases[ 'def' ]();
			   }
				
			   if( method != 'gcs' && method != 'gas' && val.match(/matri/g) && $.attr(elem, 'style') ){

					 
			        if( $(elem).attr( 'style' ).match( /transform/g ) ){
			        	val = cases[ 'gas' ]();
			        } else {
			            prop = support.getPrefixed( 'transform' );
			            val = cases[ 'gcs' ]();
			        }

			   }else if( val != 'none' && !val.match(/matri/g) ) {
			   	   valParts = this.getUnit( val );
			   	   if( this.unit != undefined && valParts[3] != this.unit ){
			   	       val = this.convertPercentPx( valParts[2], 'tpc' );
			   	   } else if( parse ) {
			   	       val = parseFloat( val );	
			   	   }
		   	   }
		   	   
		   	   return val === "auto" ? 0 : val;
	    },
	
	    isTranslatable: function(){
	    	//TODO Manage RIGHT & BOTTOM
	        return this.prop == 'left' || this.prop == 'top' ? true : false;
	    },
	
		getTranslateMode: function(x, y) {
			return support.translate3d && this.options.usetranslate3d ? 'translate3d(' + x + 'px, ' + y + 'px, 0)' : 'translate(' + x + 'px,' + y + 'px)';
		},

		getNewTranslate: function ( val ){

		   var elem = this.elem,
		   	   prop = this.prop,
		   	   initMatrix, initArray, x, y; 
		   	   
		   initMatrix = this.getCurrentVal( support.getPrefixed( 'transform', false ) );
		   initArray = initMatrix != 'none' ? this.cssMatrixToArray( initMatrix ) : [ 1, 0, 0, 1, 0, 0 ];
           x = prop === 'left' ? val : initArray[4];
           y = prop === 'left' ? initArray[5] : val;

		   return [ x, y ];
		},

	    createFx: function( start, end, unit ){
	    	
    		var self = this,
    		    start = this.start = start,
    		    end = this.end = end,
    		    initTrans, initTransArr
    		    unit = this.unit = unit,
    		    elem = this.elem,
    		    $elem = $(this.elem),
    		    options = this.options,
    		    optionsRef = {},
    		    isTranslatable = this.isTranslatable,
    		    isTransition = this.isTransition;
    		 
    		 /* TODO optimize this hack and find why this.options is overidden when use as it.*/   
    		    for( var k in options ){
    		       optionsRef[k] = options[k];
    		    }
    		    this.options = optionsRef;
    		    
            
    		/* use translate or translate3d for top/left animation  */
			if( isTranslatable ){

			    /* better perf on ipad */
			    if( support.translate3d ){
					$elem.css( support.cssprefix + 'backface-visibility', 'hidden' )
					      .css( support.cssprefix + 'perspective', 1000 );
			    }
				
				/* get a ref of the init transform values */
				if( $elem.css( support.cssprefix + 'transform' ) != 'none' ){

					initTransArr = this.cssMatrixToArray( this.getCurrentVal( support.getPrefixed( 'transform', false ) ) );
				   	initTrans = this.initTrans = { x:initTransArr[4], y:initTransArr[5] };
				} else {
					initTrans = this.initTrans = { x:0, y:0 };
				}
				
				/* check if we are dealing with both top and left anim using csstransform */
			    this.isTopLeft = this.prop == 'left' ? $(elem).data('fx.top') : $(elem).data('fx.left');
			    
			    /* apply css transform event if it is was alreay defined to write it as inline css */
				//$(elem).css( support.cssprefix + 'transform', self.getTranslateMode( initTrans.x, initTrans.y ) );

			}

    		    
    		if( isTransition ){

				var dur = (options.duration/1000),
					easing = $.csseasing[ options.easing ],
					transEventPrefix, transEventName, transEvent;
                
				
				transEvent = support.getPrefixed( 'transitionEvent' );
				if( transEvent ){
					transEventPrefix = transEvent.replace( 'TransitionEvent', '' ).toLowerCase();
					transEventName = this.transEventName = transEventPrefix != '' ? transEventPrefix + 'TransitionEnd' : 'transitionend';
					$elem.bind( transEventName, function(){ self.fxEnd() });
				}
				
				/* add the css transition only once per anim */				
				if( $elem.css( support.cssprefix + 'transition-duration' ) === "0s" ){
				    $elem.css( support.cssprefix + 'transition', 'all ' + dur + 's')
            	         .css( support.cssprefix + 'transition-timing-function', easing );
				}
			    
			    /**
			     * use a setTimeout to apply the values asynchrounously to allow the transition
			     * to start before the values are updated 
			     */
			    setTimeout(function(){ self.applyCss( end ) }, 1 );

            } else {
                /* use request animation frame  */
                this.addToRAF();
            }		
	   },
	   
	   
	   addToRAF: function(){

           var fxid = this.fxid = numFx,
               startAnim = window.mozAnimationStartTime || Date.now(),
               progress = this.progress = 0,
               progresstep = this.progressstep = (100 / ( this.options.duration / this.options.fps ) / this.options.fps),
               elapsed = this.elapsed = 0,
               pos = this.state = 0;
            
           fxQueue[numFx] = this;
           fxQueueLength++;
           numFx++; 
           if( stopRAF )startAnimationFrame();
	   },
	   
	   
	   applyCss: function( val, isTopLeft ){
	   	    
	   		var self = this,
	   			unit = this.unit,
	   			initval, trans,
	   			start = this.start, 
	   			end = this.end,
	   			prop = this.prop,
	   			$elem = $(this.elem),
    		    isTranslatable = this.isTranslatable,
    		    isTransition = this.isTransition,
	            x, y;


	       if( isTranslatable ){
	       
	        	initval = prop === 'left' ? this.initTrans.x : this.initTrans.y;
	        	
	        	if( unit === "%" ){
            	 	start = this.convertPercentPx( start, 'tpx' );
            	 	val   = this.convertPercentPx( val, 'tpx' );
	            }
	            
	            /* create a new csstransform from the new value, and merge it with the actual css transform */
	            trans = this.trans = this.getNewTranslate( ( val + initval ) - start );
	            x = trans[0];
			    y = trans[1];
		        
		        /**
		         * if we are animating both the top and left using css transform
		         * dont apply the first prop(top/left) , retrieve it's value  and merge it
		         * with the second prop(top/left) and apply both using only one css transform to avoid the 'jump to end':
		         * when changing css-transform, the newone will override the old one without any csstransition.
		         */
			    if( this.isTopLeft ){
			        clearTimeout( this.isTopLeft.fxtimer );
			        x = this.prop === 'left' ? trans[0] : this.isTopLeft.trans[0];
			        y = this.prop === 'top' ? trans[1] : this.isTopLeft.trans[1];
			    }
                
                if( isTransition && !this.isTopLeft ){
                    /**
                     * use a timeout of 1ms to manage the TOPLEFT case
                     * cf : read above
                     */
    		        this.fxtimer = setTimeout(function(){
    		            $elem.css( support.cssprefix + 'transform', self.getTranslateMode( x, y ) );
    		        },1);
                } else {
                    $elem.css( support.cssprefix + 'transform', this.getTranslateMode( x, y ) );
                }

	        }else{
	            $elem.css( prop, val + unit );
	        }

	   },
	   

	   update: function( t ){
	   	    
	   		var elapsed = this.elapsed += t,
		  		options = this.options,
		  		unit = this.unit,
		  		start = this.start,
		  		end = this.end,
		  		progress = this.progress += this.progressstep * t,
		  		newval;
			
            if( progress >= 100 ){
                this.fxEnd();
                return false;
	        }   
	        
			if( jQuery.easing != undefined && jQuery.easing[ options.easing ]){
			   e = $.easing[ options.easing ]( 0, elapsed, 0, 100, options.duration );
			}else{
			   e = $.easing['swing']( 0, elapsed, 0, 100, options.duration );
			}

			newval = start + ( ( ( end - start ) * e) / 100 );
            if( newval > 1 && unit != '%' ) newval = newval << 0;
            
            this.applyCss( newval );
	   },
	   
	   fxEnd: function(){
	   
		   var self = this,
		       prop = this.prop,
		       end = this.end,
		       unit = this.unit,
		       options = this.options,
		       elem = this.elem,
		       $elem = $(this.elem),
		       transEventName = this.transEventName,
    		   isTransition = this.isTransition,
		       complete;        
	   	   
	       if( isTransition ){
	               /* unbind transitionend event to avoid multiple 'fxEnd' call */
	               $elem.unbind( transEventName )
	                    .css( support.cssprefix + 'transition', 'none' );
	       }
	        
	       this.clearFx();
	   	   
	   	   /* set to end value because the anim never stops exactly at the specified end value */
	   	   $elem.css( prop, end + unit );
	   	   
	   	   if( this.checkEmptyFx() && typeof options.callback != undefined ){
           	    /* user defined callback */
           	    options.callback.call( elem );
           	    /* call next in the elem jquery fx queue */
           	    complete = options.complete;
				if ( complete ) {
					options.complete = false;
					complete.call( elem );
				}
           };
	   },

	   clearFx: function(){
	   
	       var self = this,
	           elem = this.elem,
	           $elem = $(this.elem),
	           prop = this.prop,
	           unit = this.unit,
	           transEventName = this.transEventName,
    		    isTranslatable = this.isTranslatable,
    		    isTransition = this.isTransition,
	      	   curr, method, fxid;

			if( isTranslatable ){

			    if( this.isTopLeft  ){
			        /**
			         * if TOPLEFT case :
			         * use getAtributeStyle to retrieve to true current cssTransform
			         * because getComputedStyle will not have the time to notice the changes 
			         * applied by the first prop (top/left) on the elem style attribute.
			         */
		        	curr = this.getCurrentVal( support.getPrefixed('transform'), 'gas'  ); 
			    } else {
		            curr = this.getCurrentVal( support.getPrefixed('transform'), 'gcs'  );
			    }
			    
			    this.resetTranslate( curr );

			}else{
        		curr = self.getCurrentVal( prop );
        		$elem.css( prop, curr + unit );
			}
            
            $elem.removeData( 'fx.' + prop );
            
			if( isTransition ){
	           if( this.checkEmptyFx() ){
	               $elem.unbind( transEventName )
	                    .css( support.cssprefix + 'transition', 'none' );
	           }
	        } else {
	            fxid = this.fxid
	           	delete fxQueue[ fxid ];
	        	fxQueueLength--;
	        	if( fxQueueLength < 1 )stopAnimationFrame();
	        }

	   },
	   
	   checkEmptyFx: function(){
	   	    var fxs = $(this.elem).data(),
        		isEmptyFx = true, k;
        		
        	for( k in fxs ){
        		if( k.match( /fx\./g ) ){
        			isEmptyFx = false;
        			break;
        		}
        	}
        	return isEmptyFx;
	   },
	   
	   resetTranslate: function( c ){

	       var self = this,
	       	   elem = this.elem,
	           initMatrix,
	           initTrans = this.initTrans,
			   start = this.start,
			   left, top,
			   endX, endY, endProp, oppProp;

           initMatrix = this.cssMatrixToArray( c );
           
           if( this.unit === "%" ){
        	   start = this.convertPercentPx( start, 'tpx' );
	           left = this.convertPercentPx( start + initMatrix[4] - initTrans.x , 'tpc' );
	           top = this.convertPercentPx( start + initMatrix[5] - initTrans.y , 'tpc' );
           } else {
	           left = start + initMatrix[4] - initTrans.x;
	           top = start + initMatrix[5] - initTrans.y
           }
          
           endX = this.prop == 'left' ? initTrans.x : initMatrix[4];
           endY = this.prop == 'left' ? initMatrix[5] : initTrans.y;
           endProp = this.prop == 'left' ? left + self.unit : top + self.unit;

           $(elem).css( self.prop, endProp );
           $(elem).css( support.cssprefix + 'transform', self.getTranslateMode( endX, endY ) );
	           
	   }
	   
	};
	
	
    /* --------------------------------------------------- */
    
    /* REPLACE JQUERY ANIMATE */ 
    
   /**
    * @function
    * @name jquery.fn.fx
    * @description same syntax as jquery.animate
	* @param {object} [props] css properties to animate
	* @param {(number|object)} [speed] speed of the animation or options for the animation
	* @param {string} [easing] easing of the animation
	* @param {function} [callback] function on the animation end
	*
	*/
		
	$.fn.fx = function( props, speed, easing, callback ) {

        var optall = jQuery.speed(speed, easing, callback);
        
        if ( jQuery.isEmptyObject( props ) ) {
			return this.each( optall.complete, [ false ] );
		}
        
        var rfxtypes = /^(?:toggle|show|hide)$/,
        	rfxanim = /^(?:width|height|top|right|bottom|left|opacity|scrolltop)$/,
        	rfxpercent = /^(?:width|height|top|right|bottom|left)$/;
		
        
		//function doFx(){
		return this[ optall.queue === false ? "each" : "queue" ](function() {
				
				var opt = speed && typeof speed === "object" ? $.extend( $.fxConfig, speed ) : $.fxConfig;
        		opt.duration = typeof speed === "number" ? speed : opt.duration;
                opt.easing = easing || 'swing';
                opt.callback = callback || function(){};
                
				opt = jQuery.extend( opt, optall );
				
				var f, start, end, unit, startunit,
					parts, startParts, $parent, parentDim;
				
				for( p in props ){
    				
    				if ( rfxtypes.test( p ) ){
    					/** 
    					 * check if we are dealing with 'show','toggle' or 'hide' prop
    					 * TODO check if the property can be animated comparing it to an array of allowed properties
    					 * instead of using the jquery rfxtypes regexp
    					 */
    				} else { 				
						/**
						 * Set display property to inline-block for height/width
						 * animations on inline elements that are having width/height animated
						 */
						if ( $.css( this, p ) === ( "width"||"height" ) && $.css( this, "display" ) === "inline" && $.css( this, "float" ) === "none" ) {
						    $( this ).css( "display", "inline-block" );
						}	 
      
	    				/* Create a new fx */
						f = new Fx( this, opt, p );
						/**
						 * add a ref to this fx on elem.data fx.prop[p]
						 * the 'fx.' will help to only retrieve the fx key in $(elem).data()
						 */
						$(this).data( 'fx.'+p, f );
						
						
						$parent = f.parent = $(this).parent();
                        parentDim = f.parentDim = p === 'left' || p == 'width' ?  $parent[ 'width' ]() : $parent[ 'height' ]();
                        if( $parent.css('position') === "static" ) $parent.css('position', 'relative');

						/* get the end value as [ value, number, unit ] array */
						parts = f.getUnit( props[p] );
						startParts = f.getUnit( f.getCurrentVal( p , 'gcs', false ) );

						if( parts ){
							
							endunit = parts[3] || ( $.cssNumber[ p ] ? "" : "px" );
							startunit = startParts[3];
							start = parseFloat( startParts[2] );//f.getCurrentVal();
							end = parseFloat( parts[2] );

							/* Manage Percent Values */
							if ( startunit != endunit ) {
                                

                                if ( endunit === "%" && rfxpercent.test( p ) ) {
									if( startunit === "px" ){
										start = f.convertPercentPx( startParts[2], 'tpc' );
										$(this).css( p, start + endunit );
									}
								}else{
									start = f.convertPercentPx( startParts[2], 'tpx' );
								    $(this).css( p, start + endunit );
								}
							}

							/* manage +=/-= relative value */
							if ( parts[1] ) {
								end = ( (parts[ 1 ] === "-=" ? -1 : 1) * end ) + start;
							}
                            
							f.createFx( start, end, endunit );
							
						} else {
							
							f.createFx( start, prop[p], "" );
							
						}	                                           
    				}
    			};
    			
			// For JS strict compliance
			return true;
		});
		//};
        
        /* call the function now, or add it the the fx queue */
        //return optall.queue === false ? this.each( doFx ) : this.queue( optall.queue, doFx );

	};
	
	
    /* --------------------------------------------------- */
    
    /* REPLACE JQUERY STOP */
    
   /**
    * @function
    * @name jquery.fn.stop
    * @description same syntax as jquery.stop
	* @param {boolean} [clearQueue] clear the element jquery fx Queue
	* @param {boolean} [gotoEnd] go directly to the end of the animation and call the user defined callback function
	*
	*/
    
	jQuery.fn.stop = function( clearQueue, gotoEnd ) {
		
		var clearQueue = clearQueue || true,
		    gotoEnd = gotoEnd || false,
		    action = gotoEnd ? 'fxEnd' : 'clearFx';
		
		if (clearQueue) this.queue([]);
		
        this.each(function (index){
        	var k, fxs = $(this).data();
        	for( k in fxs ){
        		if( k.match( /fx\./g ) ){
        		    fxs[k][action]();
        		}
        	};
        });
        
        /* call the orginal jquery 'stop' method */
        return jStop.apply(this, [clearQueue, gotoEnd]);
    };
     
})(jQuery);