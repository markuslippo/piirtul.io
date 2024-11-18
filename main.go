package main

import (
	"embed"
	"io"
	"io/fs"
	"log"
	"net/http"
	"text/template"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type Template struct {
	templates *template.Template
}

func (t *Template) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	return t.templates.ExecuteTemplate(w, name, data)
}

func staticRender(template string) echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.Render(http.StatusOK, template, nil)
	}
}

//go:embed embed/*
var embededFiles embed.FS

func main() {
	e := echo.New()

	viewFiles, err := fs.Sub(embededFiles, "embed/views")
	if err != nil {
		log.Fatalf("failed to open filesystem views: %s", err.Error())
	}
	e.Renderer = &Template{
		templates: template.Must(template.ParseFS(viewFiles, "*.html")),
	}

	e.Use(middleware.Logger())
	e.Use(middleware.Secure())
	e.Use(middleware.RemoveTrailingSlash())

	ss := SignalingServer{
		users: []*User{},
		rooms: &RoomService{
			DB: &RoomSlice{
				rooms: make([]*Room, 0),
			},
		},
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}

	resourcesFiles, err := fs.Sub(embededFiles, "embed/assets")
	if err != nil {
		log.Fatalf("failed to open filesystem assets: %s", err.Error())
	}
	e.GET("/assets/*", echo.WrapHandler(http.StripPrefix("/assets/", http.FileServer(http.FS(resourcesFiles)))))

	e.GET("/", staticRender("landing"))
	e.GET("/initiate", initiateHandler(ss.rooms, &ss))
	e.GET("/room", staticRender("main"))
	e.GET("/websocket", ss.Handler)

	e.Logger.Fatal(e.Start("localhost:8080"))
}
