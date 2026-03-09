Ok I want to explain to you what I want with this project.

First off, this project will be an art installation with web technologies as the main medium of diffusion.

The working title is anemoia. It'll basically be a point and click game but instead of using the canvas to creates scenes, I'll use web pages instead. I think it's a nice way to use element normally used to make a website and make a game with it. Point and click would be a good use case to test this + it's nostalgic.

The foundation of the project code base is build with astro.js.

This decision was made because I want the project to be as modular as possible and astro is built around components so it felt like a great match for that project

I'm still in the early phases of the engineering so this is why I need your help.

This project is part of a 2 weeks art residency so I'm working on an MVP to present at the end.

I want to represent 2 or 3 quebec city neighborhoods using photo that will be taken in person in the field. These photo will be laid out with some layering or index so that we can create parallax effect during page transition and interaction.

My collegue already made a photo collage using more than a dozen image so for that I was wondering how can we import all the layers while still managing their position as they were in photoshop without having to position absolute everything again with hardcoded pixel.

these images would display element like buildings, houses, parks, trees, skybox and event some atmospheric element in the foreground like snowflakes or rain.

Within these singular image element component, some element of it (like a subimages) could be interactive -- for example a door, entryway, car, etc), and these would be juste another smaller image of the door on top or just an interactive element on top of it.

For example, clicking on a door would move the user to a new scene .

The hierarchy of data and progression in the game would be.

1. Index (menu of game, splash screen)
2. Overworld (A 2d map where we can click on a neighborhood to visit)

- The map could be one or multiple photos, each neighborhoods would be clickable with an interactive zone within like stated earlier

3. Neighborhood view

- Multiples images of the neighborhood assembled in a skyline-like view with images residing within layer index so that we can order them in the z-index and have parrallax effect on transition or mouse movement for example.
- Some images would have clickable/interactive zone. I need to determine if these interactive zone would be images in themselves or a zone or both, for example, a door, I would love for it that when I hover it, it would show the door opened (so a new image), Or clicking on a window would turn on the light. ( but for these types of effect we could use a canvas with webgl shaders.

4. The last view or scene would be a scene where there is a short story scrolling along with an audio voiceover that narrates the short story. (See Lost Odyssey thousand years of dreams as my inspiration for this scene.

To note: There would be audio in each view/scene. Some image will actually be video loops.

I've already made a very very simple quick demo but the current layout of files and structure can change.

Needs to be modular to add more neighborhoods and short stories over time.

Can you make a plan to build a project like this in the most effective manner by using astro.js modular component system, content collection (for textual content like the short stories), and assets management and optimisation).

Step 1 would be the main foundation of the project( The project structure, naming convention, js convention, css convention(bem and scss), the views, the scene, the management of the assets (images,video,audio,3d models?)
Step 2 would be to figure out how to keep the images position from the psd into the web view ( Is there a way to export a json array of the layers position from the photoshop file?)
Step 3 would be to figure out the interactivity and how to route the overworld to the neighborhoods and then from that neighborhood view to routes to the different stories, and how to manage the interactive zones and assets
Step 4 would be to figure out how to add a canvas layer so that we can use shaders for post processing on each z-layers or each image.Also figure out how to integrate gsap and probably locomotive scroll to the story views to make it look nice. Adding view transition to view change (from map to neighborhood, to neighborhood to scene,etc)

Use context7 to get the docs from astro, gsap, locomotive v5 and p5.js(for the post processing)

Lets make a plan
